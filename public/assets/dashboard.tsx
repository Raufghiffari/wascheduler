
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createRoot } from 'react-dom/client';
import { formatPreviewPostAt } from '../../shared/preview-waktu';

type StatusWa = {
  status: 'mati' | 'menghubungkan' | 'terhubung' | 'logout';
  terakhirUpdateMs: number;
  nomor: string | null;
  catatan: string | null;
  qrDataUrl: string | null;
};

type ResWa = { ok: boolean; wa?: StatusWa; pesan?: string };
type ResSession = {
  ok: boolean;
  session?: { userId: string; username: string };
  pesan?: string;
};

type InfoMedia = {
  namaAsli: string;
  pathRelatif: string;
  mime: string;
  tipe: 'foto' | 'video';
  ukuranByte: number;
};

type TipeAudience = 'my_contacts' | 'my_contacts_excluded' | 'only_share_with' | 'developer_command';
type JenisJob = 'wa_status' | 'send_message';

type BlokSendMessage =
  | { id: string; jenis: 'delay'; durasi: { jam: number; menit: number; detik: number } }
  | { id: string; jenis: 'wait_reply'; mode: 'any' | 'exact'; expectedText?: string }
  | { id: string; jenis: 'send_message'; pesan: string };

type SendMessageInfo = {
  nomorTujuan: string;
  pesanAwal: string;
  media?: InfoMedia;
  blok: BlokSendMessage[];
  progress?: {
    initialSent: boolean;
    nextBlockIndex: number;
    pendingSend?: {
      tahap: 'initial' | 'block';
      blockIndex?: number;
      retryCount: number;
      nextRetryAtMs?: number;
      lastError?: string;
    };
    waitingReply?: {
      mode: 'any' | 'exact';
      expectedText?: string;
      startedAtMs: number;
      timeoutAtMs: number;
      blockIndex: number;
    };
    terakhirReplyCocokMs?: number;
  };
};

type Job = {
  id: string;
  jenis?: JenisJob;
  dibuatPadaMs: number;
  targetMs: number;
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancel';
  media?: InfoMedia;
  caption?: string;
  audience?: { tipe: TipeAudience; daftarNomor?: string[]; command?: string };
  sendMessage?: SendMessageInfo;
  attemptCount: number;
  terakhirAttemptMs?: number;
  berikutnyaCobaMs?: number;
  terakhirError?: string;
  selesaiMs?: number;
};

type ResJobs = { ok: boolean; job?: Job[]; pesan?: string };
type ResClearCompleted = { ok: boolean; jumlahDihapus: number };

type BlokUi =
  | { id: string; jenis: 'delay'; jam: string; menit: string; detik: string }
  | { id: string; jenis: 'wait_reply'; mode: 'any' | 'exact'; expectedText: string }
  | { id: string; jenis: 'send_message'; pesan: string };

function formatWaktu(ms: number): string {
  return new Date(ms).toLocaleString('en-GB', { hour12: false });
}

function formatUkuran(byte: number): string {
  const mb = byte / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = byte / 1024;
  return `${kb.toFixed(0)} KB`;
}

function pecahNomor(teks: string): string[] {
  const potongan = String(teks ?? '')
    .split(/[\n,;\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const hasil: string[] = [];
  for (const p of potongan) {
    let digit = p.replace(/\D/g, '');
    if (digit.startsWith('0')) digit = '62' + digit.slice(1);
    if (digit.length >= 8) hasil.push(digit);
  }
  return Array.from(new Set(hasil));
}

function rapikanNomorSatu(teks: string): string | null {
  const daftar = pecahNomor(teks);
  return daftar[0] || null;
}

function formatNomorTerhubung(nomorRaw: string | null): string {
  const sumber = String(nomorRaw || '').trim();
  if (!sumber) return '-';
  const jid = sumber.split('@')[0] || sumber;
  let digit = jid.replace(/\D/g, '');
  if (digit.startsWith('62')) digit = `0${digit.slice(2)}`;
  if (!digit) return '-';
  return digit;
}

function ambilPesanError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function normalisasiAngka(v: string, maks: number): number {
  const angka = Number(v || 0);
  if (!Number.isFinite(angka)) return 0;
  return Math.max(0, Math.min(maks, Math.floor(angka)));
}

function buatIdBlok(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function ringkasProgressSendMessage(job: Job): string {
  if (!job.sendMessage?.progress) return 'Waiting initial send';
  const progress = job.sendMessage.progress;
  if (progress.waitingReply) {
    return progress.waitingReply.mode === 'exact'
      ? `Waiting exact reply: "${progress.waitingReply.expectedText || ''}"`
      : 'Waiting for any reply';
  }
  if (progress.pendingSend) {
    const retry = progress.pendingSend.retryCount + 1;
    return progress.pendingSend.tahap === 'initial'
      ? `Sending initial message (${retry}/3)`
      : `Sending block ${Number(progress.pendingSend.blockIndex || 0) + 1} (${retry}/3)`;
  }
  const total = job.sendMessage.blok.length;
  const idx = progress.nextBlockIndex;
  if (!progress.initialSent) return 'Pending initial send';
  if (idx >= total) return 'All blocks done';
  return `Next block ${idx + 1}/${total}`;
}

async function bacaJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function pesanApi(defaultPesan: string, res: Response, json: { pesan?: string } | null): string {
  const pesan = String(json?.pesan || '').trim();
  if (pesan) return pesan;
  return `${defaultPesan} (${res.status})`;
}

function redirectTop(url: string): void {
  if (window.top && window.top !== window) {
    window.top.location.href = url;
    return;
  }
  window.location.href = url;
}

async function pastikanAuth(res: Response): Promise<void> {
  if (res.status === 401) {
    redirectTop('/');
    throw new Error('Session expired');
  }
}

function terjemahCatatanWa(catatan: string | null): string {
  const sumber = String(catatan || '').trim();
  if (!sumber) return 'Waiting for status';
  const map: Record<string, string> = {
    'Membuat socket baru...': 'Creating new socket',
    'Scan QR di authorize page.': 'Scan the QR code from authorize page',
    'Terhubung.': 'Connected',
    'Putus, mencoba reconnect...': 'Disconnected and reconnecting',
    'Perangkat logout. Reset sesi otomatis lalu buat QR baru...': 'Logged out. Resetting session and generating new QR',
    'Sesi WA tidak sinkron. Hapus folder wa_auth user lalu scan ulang.': 'Session mismatch. Reset user auth and relink',
  };
  return map[sumber] || sumber;
}

async function ambilStatusWa(): Promise<StatusWa> {
  const res = await fetch('/api/wa/status');
  await pastikanAuth(res);
  const json = await bacaJson<ResWa>(res);
  if (!res.ok || !json?.ok || !json.wa) {
    throw new Error(pesanApi('Failed to fetch WA status', res, json));
  }
  return json.wa;
}

async function ambilNamaAccount(): Promise<string> {
  const res = await fetch('/api/session');
  await pastikanAuth(res);
  const json = await bacaJson<ResSession>(res);
  if (!res.ok || !json?.ok) {
    throw new Error(pesanApi('Failed to fetch session', res, json));
  }
  return String(json.session?.username || '').trim();
}

async function ambilJobs(): Promise<Job[]> {
  const res = await fetch('/api/jobs');
  await pastikanAuth(res);
  const json = await bacaJson<ResJobs>(res);
  if (!res.ok || !json?.ok || !Array.isArray(json.job)) {
    throw new Error(pesanApi('Failed to fetch jobs', res, json));
  }
  return json.job;
}

async function batalkanJob(id: string): Promise<void> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error(j?.pesan || 'Failed to cancel job');
  }
}

async function hapusJobSelesai(): Promise<number> {
  const res = await fetch('/api/jobs/clear-completed', { method: 'POST' });
  const json = await bacaJson<ResClearCompleted & { pesan?: string }>(res);
  if (!res.ok || !json?.ok) {
    throw new Error(pesanApi('Failed to clear completed jobs', res, json));
  }
  return Number(json.jumlahDihapus || 0);
}

async function kirimLogout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST' });
}

function uploadDenganProgres(file: File, onProgress: (persen: number) => void): Promise<InfoMedia> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('media', file);

    xhr.open('POST', '/api/upload');
    xhr.upload.addEventListener('progress', (e) => {
      if (!e.lengthComputable) return;
      const persen = Math.round((e.loaded / e.total) * 100);
      onProgress(persen);
    });

    xhr.addEventListener('load', () => {
      try {
        const json = JSON.parse(xhr.responseText) as { ok: boolean; media?: InfoMedia; pesan?: string };
        if (!json.ok || !json.media) {
          reject(new Error(json.pesan || 'Upload failed'));
          return;
        }
        resolve(json.media);
      } catch (err) {
        reject(err);
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.send(form);
  });
}

async function kirimJobWaStatus(payload: {
  durasi: { jam: number; menit: number; detik: number };
  media: InfoMedia;
  caption: string;
  audience: { tipe: TipeAudience; daftarNomor?: string[]; command?: string };
}): Promise<void> {
  const res = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jenis: 'wa_status', ...payload }),
  });
  await pastikanAuth(res);
  const json = await bacaJson<{ ok: boolean; pesan?: string }>(res);
  if (!res.ok || !json?.ok) throw new Error(pesanApi('Failed to create WA Status job', res, json));
}

async function kirimJobSendMessage(payload: {
  durasi: { jam: number; menit: number; detik: number };
  sendMessage: { nomorTujuan: string; pesanAwal: string; media?: InfoMedia; blok: BlokSendMessage[] };
}): Promise<void> {
  const res = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jenis: 'send_message', ...payload }),
  });
  await pastikanAuth(res);
  const json = await bacaJson<{ ok: boolean; pesan?: string }>(res);
  if (!res.ok || !json?.ok) throw new Error(pesanApi('Failed to create Send Message job', res, json));
}

function DashboardApp(): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const berjalanDalamFrame =
    window.location.pathname === '/dashboard-frame' || window.location.pathname === '/dashboard-frame.html';
  const [toast, setToast] = useState('');
  const [namaAccount, setNamaAccount] = useState('');
  const [wa, setWa] = useState<StatusWa | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [composerMode, setComposerMode] = useState<'none' | 'wa_status' | 'send_message'>('none');

  const [mediaStatus, setMediaStatus] = useState<InfoMedia | null>(null);
  const [uploadStatusMode, setUploadStatusMode] = useState('idle');
  const [uploadStatusProgress, setUploadStatusProgress] = useState(0);
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);
  const [durasiJam, setDurasiJam] = useState('');
  const [durasiMenit, setDurasiMenit] = useState('');
  const [durasiDetik, setDurasiDetik] = useState('');
  const [caption, setCaption] = useState('');
  const [audienceTipe, setAudienceTipe] = useState<TipeAudience>('my_contacts');
  const [audienceInput, setAudienceInput] = useState('');

  const [mediaSend, setMediaSend] = useState<InfoMedia | null>(null);
  const [uploadSendStatus, setUploadSendStatus] = useState('idle');
  const [uploadSendProgress, setUploadSendProgress] = useState(0);
  const [sendJam, setSendJam] = useState('');
  const [sendMenit, setSendMenit] = useState('');
  const [sendDetik, setSendDetik] = useState('');
  const [sendNomor, setSendNomor] = useState('');
  const [sendPesanAwal, setSendPesanAwal] = useState('');
  const [sendBlocks, setSendBlocks] = useState<BlokUi[]>([]);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);
  const [isSubmittingSend, setIsSubmittingSend] = useState(false);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const statusInputFileRef = useRef<HTMLInputElement>(null);
  const sendInputFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 2000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const spring = useMemo(
    () =>
      reduceMotion
        ? { duration: 0 }
        : {
            type: 'spring' as const,
            stiffness: 215,
            damping: 23,
            mass: 0.72,
          },
    [reduceMotion],
  );

  const teksJam = useMemo(
    () =>
      new Date(nowMs).toLocaleTimeString('en-GB', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    [nowMs],
  );

  const previewStatus = useMemo(
    () =>
      formatPreviewPostAt(
        {
          jam: normalisasiAngka(durasiJam, 999),
          menit: normalisasiAngka(durasiMenit, 59),
          detik: normalisasiAngka(durasiDetik, 59),
        },
        new Date(nowMs),
      ),
    [durasiJam, durasiMenit, durasiDetik, nowMs],
  );

  const previewSend = useMemo(
    () =>
      formatPreviewPostAt(
        {
          jam: normalisasiAngka(sendJam, 999),
          menit: normalisasiAngka(sendMenit, 59),
          detik: normalisasiAngka(sendDetik, 59),
        },
        new Date(nowMs),
      ),
    [sendJam, sendMenit, sendDetik, nowMs],
  );

  const jumlahSelesai = useMemo(
    () => jobs.filter((job) => job.status === 'success' || job.status === 'cancel').length,
    [jobs],
  );

  const infoAudience = useMemo(() => {
    if (audienceTipe === 'my_contacts') return { tampil: false, label: '', hint: '', placeholder: '' };
    if (audienceTipe === 'developer_command') {
      return {
        tampil: true,
        label: 'Developer command',
        hint: 'Available commands @private.all @mypreset.1 @mypreset.2',
        placeholder: '@private.all',
      };
    }
    return {
      tampil: true,
      label: 'Contact list',
      hint: 'Use comma space or newline 08xx will be normalized to 62xx',
      placeholder: '62812xxxx 62813xxxx',
    };
  }, [audienceTipe]);

  async function muatSemua(): Promise<void> {
    const [hasilWa, hasilJobs, hasilSession] = await Promise.allSettled([
      ambilStatusWa(),
      ambilJobs(),
      ambilNamaAccount(),
    ]);
    if (hasilWa.status === 'fulfilled') {
      setWa(hasilWa.value);
      if (!berjalanDalamFrame && hasilWa.value.status !== 'terhubung') {
        redirectTop('/authorize');
        return;
      }
    } else {
      setToast(`WA status error ${ambilPesanError(hasilWa.reason)}`);
    }

    if (hasilJobs.status === 'fulfilled') setJobs(hasilJobs.value);
    else setToast(`Jobs error ${ambilPesanError(hasilJobs.reason)}`);

    if (hasilSession.status === 'fulfilled') setNamaAccount(hasilSession.value);

    if (hasilWa.status === 'rejected' && hasilJobs.status === 'rejected' && hasilSession.status === 'rejected') {
      throw new Error('Failed to load dashboard data');
    }
  }

  useEffect(() => {
    void muatSemua().catch((err) => setToast(ambilPesanError(err)));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const poll = window.setInterval(() => {
      void muatSemua().catch(() => null);
    }, 2500);
    return () => window.clearInterval(poll);
  }, []);

  async function handleUploadStatus(file: File): Promise<void> {
    setUploadStatusMode('uploading');
    setUploadStatusProgress(0);
    setToast('Upload started');
    try {
      const media = await uploadDenganProgres(file, setUploadStatusProgress);
      setMediaStatus(media);
      setUploadStatusMode('uploaded');
      setComposerMode('wa_status');
      setToast('Upload complete');
    } catch (err) {
      setUploadStatusMode('failed');
      setToast(ambilPesanError(err));
    } finally {
      window.setTimeout(() => setUploadStatusMode('idle'), 900);
    }
  }

  async function handleUploadSend(file: File): Promise<void> {
    setUploadSendStatus('uploading');
    setUploadSendProgress(0);
    setToast('Uploading media for send message');
    try {
      const media = await uploadDenganProgres(file, setUploadSendProgress);
      setMediaSend(media);
      setUploadSendStatus('uploaded');
      setComposerMode('send_message');
      setToast('Media ready');
    } catch (err) {
      setUploadSendStatus('failed');
      setToast(ambilPesanError(err));
    } finally {
      window.setTimeout(() => setUploadSendStatus('idle'), 900);
    }
  }

  async function handleSubmitStatus(): Promise<void> {
    if (!mediaStatus) {
      setToast('Upload a file first');
      return;
    }

    const jam = normalisasiAngka(durasiJam, 999);
    const menit = normalisasiAngka(durasiMenit, 59);
    const detik = normalisasiAngka(durasiDetik, 59);
    if (jam + menit + detik <= 0) {
      setToast('Duration must be greater than zero');
      return;
    }

    const tipeAud = audienceTipe;
    const inputAudienceMentah = String(audienceInput || '').trim();
    const daftarNomor =
      tipeAud === 'my_contacts' || tipeAud === 'developer_command'
        ? undefined
        : pecahNomor(inputAudienceMentah);
    const command = tipeAud === 'developer_command' ? inputAudienceMentah : undefined;

    setIsSubmittingStatus(true);
    try {
      await kirimJobWaStatus({
        durasi: { jam, menit, detik },
        media: mediaStatus,
        caption: caption.trim(),
        audience: { tipe: tipeAud, daftarNomor, command },
      });
      setToast('WA Status schedule saved');
      setMediaStatus(null);
      setDurasiJam('');
      setDurasiMenit('');
      setDurasiDetik('');
      setCaption('');
      setAudienceTipe('my_contacts');
      setAudienceInput('');
      setUploadStatusProgress(0);
      setComposerMode('none');
      await muatSemua();
    } catch (err) {
      setToast(ambilPesanError(err));
    } finally {
      setIsSubmittingStatus(false);
    }
  }

  function tambahBlockDelay(): void {
    setSendBlocks((prev) => [...prev, { id: buatIdBlok(), jenis: 'delay', jam: '', menit: '', detik: '' }]);
  }

  function tambahBlockWaitReply(): void {
    setSendBlocks((prev) => [...prev, { id: buatIdBlok(), jenis: 'wait_reply', mode: 'any', expectedText: '' }]);
  }

  function tambahBlockSendMessage(): void {
    setSendBlocks((prev) => [...prev, { id: buatIdBlok(), jenis: 'send_message', pesan: '' }]);
  }

  function hapusBlock(id: string): void {
    setSendBlocks((prev) => prev.filter((item) => item.id !== id));
  }

  function updateBlock(id: string, patch: Partial<BlokUi>): void {
    setSendBlocks((prev) => prev.map((item) => (item.id === id ? ({ ...item, ...patch } as BlokUi) : item)));
  }

  function pindahkanBlock(dariId: string, keId: string): void {
    if (dariId === keId) return;
    setSendBlocks((prev) => {
      const idxDari = prev.findIndex((b) => b.id === dariId);
      const idxKe = prev.findIndex((b) => b.id === keId);
      if (idxDari < 0 || idxKe < 0) return prev;
      if (idxDari === idxKe) return prev;
      const clone = [...prev];
      const [item] = clone.splice(idxDari, 1);
      clone.splice(idxKe, 0, item);
      return clone;
    });
  }

  function mulaiDragBlock(id: string, e: React.DragEvent<HTMLDivElement>): void {
    setDraggingBlockId(id);
    setDragOverBlockId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }

  function saatDragMasukBlock(id: string): void {
    if (!draggingBlockId || draggingBlockId === id) return;
    if (dragOverBlockId === id) return;
    setDragOverBlockId(id);
    pindahkanBlock(draggingBlockId, id);
  }

  function selesaiDragBlock(): void {
    setDraggingBlockId(null);
    setDragOverBlockId(null);
  }

  async function handleSubmitSendMessage(): Promise<void> {
    const jam = normalisasiAngka(sendJam, 999);
    const menit = normalisasiAngka(sendMenit, 59);
    const detik = normalisasiAngka(sendDetik, 59);
    if (jam + menit + detik <= 0) {
      setToast('Send At duration must be greater than zero');
      return;
    }

    const nomorTujuan = rapikanNomorSatu(sendNomor);
    if (!nomorTujuan) {
      setToast('Phone Number is not valid');
      return;
    }

    const pesanAwal = String(sendPesanAwal || '').trim();
    if (!pesanAwal) {
      setToast('Message is required');
      return;
    }

    const blokFinal: BlokSendMessage[] = [];
    for (const block of sendBlocks) {
      if (block.jenis === 'delay') {
        const dJam = normalisasiAngka(block.jam, 999);
        const dMenit = normalisasiAngka(block.menit, 59);
        const dDetik = normalisasiAngka(block.detik, 59);
        if (dJam + dMenit + dDetik <= 0) {
          setToast('Delay block must be greater than zero');
          return;
        }
        blokFinal.push({ id: block.id, jenis: 'delay', durasi: { jam: dJam, menit: dMenit, detik: dDetik } });
        continue;
      }

      if (block.jenis === 'wait_reply') {
        const expectedText = String(block.expectedText || '').trim();
        if (block.mode === 'exact' && !expectedText) {
          setToast('Wait reply exact needs expected text');
          return;
        }
        blokFinal.push({
          id: block.id,
          jenis: 'wait_reply',
          mode: block.mode,
          expectedText: block.mode === 'exact' ? expectedText : undefined,
        });
        continue;
      }

      const pesan = String(block.pesan || '').trim();
      if (!pesan) {
        setToast('Send message block cannot be empty');
        return;
      }
      blokFinal.push({ id: block.id, jenis: 'send_message', pesan });
    }

    setIsSubmittingSend(true);
    try {
      await kirimJobSendMessage({
        durasi: { jam, menit, detik },
        sendMessage: {
          nomorTujuan,
          pesanAwal,
          media: mediaSend || undefined,
          blok: blokFinal,
        },
      });
      setToast('Send Message schedule saved');
      setMediaSend(null);
      setUploadSendProgress(0);
      setSendJam('');
      setSendMenit('');
      setSendDetik('');
      setSendNomor('');
      setSendPesanAwal('');
      setSendBlocks([]);
      setComposerMode('none');
      await muatSemua();
    } catch (err) {
      setToast(ambilPesanError(err));
    } finally {
      setIsSubmittingSend(false);
    }
  }

  const waCatatan = wa?.status === 'terhubung'
    ? `Connected On ${formatNomorTerhubung(wa?.nomor || null)}`
    : terjemahCatatanWa(wa?.catatan || null);

  return (
    <div className="appShell">
      <motion.main
        className="appContainer"
        initial={reduceMotion ? undefined : { opacity: 0, filter: 'blur(12px)', y: 22 }}
        animate={reduceMotion ? undefined : { opacity: 1, filter: 'blur(0px)', y: 0 }}
        transition={spring}
      >
        <motion.header className="surfaceCard heroCard heroCardDash" layout transition={spring}>
          <p className="heroTag">WA Status Scheduler</p>
          <h1 className="edgeTitle">DASHBOARD</h1>
          <p className="heroSubtitle">Here's Your Panel</p>
          <div className="heroActions heroActionsDashControls">
            <span className="topControlChip">Account: {namaAccount || '-'}</span>
            <span className="topControlChip">{teksJam}</span>
            <motion.button
              type="button"
              className="btn btnGhost btnCompact btnTopControl"
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              onClick={() => void kirimLogout().finally(() => redirectTop('/'))}
            >
              Logout
            </motion.button>
          </div>
          <div className="headerLine" />
        </motion.header>

        <motion.section className="surfaceCard cardBody" initial={reduceMotion ? undefined : { opacity: 0, y: 14 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ ...spring, delay: reduceMotion ? 0 : 0.04 }}>
          <div className="row">
            <div>
              <h2 className="titleCard">WhatsApp</h2>
              <div className="metaText">{waCatatan}</div>
            </div>
          </div>
        </motion.section>

        <motion.section className="surfaceCard toolbarCard" layout transition={spring}>
          <div className="toolbarGrid">
            <motion.button type="button" className="btn iconBtn" whileTap={reduceMotion ? undefined : { scale: 0.98 }} onClick={() => statusInputFileRef.current?.click()}>
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              Upload
            </motion.button>

            <motion.button type="button" className="btn iconBtn" whileTap={reduceMotion ? undefined : { scale: 0.98 }} onClick={() => setComposerMode('send_message')}>
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20l16-8L4 4v6l10 2-10 2z" />
              </svg>
              Send Message
            </motion.button>
          </div>

          <input ref={statusInputFileRef} type="file" accept="image/*,video/*" className="hiddenInput" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            await handleUploadStatus(file);
            e.target.value = '';
          }} />
        </motion.section>

        <AnimatePresence>
          {composerMode === 'wa_status' ? (
            <motion.section className="surfaceCard cardBody composerCard" layout initial={reduceMotion ? undefined : { opacity: 0, y: 10 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: 10 }} transition={spring}>
              <div className="row">
                <div>
                  <h2 className="titleCard">Upload Status</h2>
                  <div className="metaText">Use duration from now then submit when ready</div>
                </div>
                <span className="badge">{uploadStatusMode}</span>
              </div>

              <div className="progressTrack">
                <motion.div className="progressFill" animate={{ width: `${uploadStatusProgress}%` }} transition={spring} />
              </div>

              <div className="schedulePanel">
                <div className="fieldLabel">File</div>
                <div className="metaText">
                  {mediaStatus
                    ? `${mediaStatus.namaAsli} ${mediaStatus.tipe} ${formatUkuran(mediaStatus.ukuranByte)}`
                    : 'No file selected, use Upload button from toolbar'}
                </div>

                <div className="fieldLabel">Post after submit by duration</div>
                <div className="durationGrid">
                  <input className="input" inputMode="numeric" placeholder="hours" value={durasiJam} onChange={(e) => setDurasiJam(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                  <input className="input" inputMode="numeric" placeholder="minutes" value={durasiMenit} onChange={(e) => setDurasiMenit(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                  <input className="input" inputMode="numeric" placeholder="seconds" value={durasiDetik} onChange={(e) => setDurasiDetik(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                </div>
                <div className="previewWaktu">{previewStatus.teks}</div>

                <div className="fieldLabel">Type</div>
                <select className="select" value="wa_status" disabled><option value="wa_status">WA Status</option></select>

                <div className="fieldLabel">Caption optional</div>
                <input className="input" placeholder="Write caption" value={caption} onChange={(e) => setCaption(e.target.value)} />

                <div className="fieldLabel">Status audience</div>
                <select className="select" value={audienceTipe} onChange={(e) => setAudienceTipe(e.target.value as TipeAudience)}>
                  <option value="my_contacts">My contacts</option>
                  <option value="my_contacts_excluded">My contacts excluded</option>
                  <option value="only_share_with">Only share with</option>
                  <option value="developer_command">Developer command</option>
                </select>

                {infoAudience.tampil ? (
                  <>
                    <div className="fieldLabel">{infoAudience.label}</div>
                    <textarea className="textarea" value={audienceInput} placeholder={infoAudience.placeholder} onChange={(e) => setAudienceInput(e.target.value)} />
                    <div className="metaText">{infoAudience.hint}</div>
                  </>
                ) : null}

                <div className="spacer12" />
                <motion.button type="button" className="btn btnPrimary btnWide" whileTap={reduceMotion ? undefined : { scale: 0.98 }} disabled={isSubmittingStatus} onClick={() => void handleSubmitStatus()}>
                  {isSubmittingStatus ? 'Saving schedule' : 'Submit schedule'}
                </motion.button>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {composerMode === 'send_message' ? (
            <motion.section className="surfaceCard cardBody composerCard" layout initial={reduceMotion ? undefined : { opacity: 0, y: 10 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: 10 }} transition={spring}>
              <div className="row">
                <div>
                  <h2 className="titleCard">Send Message</h2>
                  <div className="metaText">Schedule chat + optional atomic follow-up blocks</div>
                </div>
                <span className="badge">{uploadSendStatus}</span>
              </div>

              <div className="progressTrack"><motion.div className="progressFill" animate={{ width: `${uploadSendProgress}%` }} transition={spring} /></div>

              <div className="schedulePanel">
                <div className="uploadInlineRow">
                  <div>
                    <div className="fieldLabel mediaFieldLabel">Media (optional)</div>
                    <div className="metaText">{mediaSend ? `${mediaSend.namaAsli} ${mediaSend.tipe} ${formatUkuran(mediaSend.ukuranByte)}` : 'No media'}</div>
                  </div>
                  <motion.button type="button" className="btn btnGhost" whileTap={reduceMotion ? undefined : { scale: 0.98 }} onClick={() => sendInputFileRef.current?.click()}>
                    Upload
                  </motion.button>
                </div>

                <input ref={sendInputFileRef} type="file" accept="image/*,video/*" className="hiddenInput" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await handleUploadSend(file);
                  e.target.value = '';
                }} />

                <div className="fieldLabel">Type</div>
                <select className="select" value="send_message" disabled><option value="send_message">Send Message</option></select>

                <div className="fieldLabel">Send At (duration)</div>
                <div className="durationGrid">
                  <input className="input" inputMode="numeric" placeholder="hours" value={sendJam} onChange={(e) => setSendJam(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                  <input className="input" inputMode="numeric" placeholder="minutes" value={sendMenit} onChange={(e) => setSendMenit(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                  <input className="input" inputMode="numeric" placeholder="seconds" value={sendDetik} onChange={(e) => setSendDetik(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                </div>
                <div className="previewWaktu">{previewSend.teks}</div>

                <div className="fieldLabel">Phone Number</div>
                <input className="input" placeholder="08xx / 62xx" value={sendNomor} onChange={(e) => setSendNomor(e.target.value)} />

                <div className="fieldLabel">Message</div>
                <textarea className="textarea" placeholder="Initial message" value={sendPesanAwal} onChange={(e) => setSendPesanAwal(e.target.value)} />

                <div className="fieldLabel">Add More Function</div>
                <div className="blockList">
                  {sendBlocks.map((block, idx) => {
                    const isDragTarget = Boolean(
                      draggingBlockId && dragOverBlockId === block.id && draggingBlockId !== block.id,
                    );
                    return (
                    <motion.div
                      key={block.id}
                      className={`blockItem${draggingBlockId === block.id ? ' dragging' : ''}${isDragTarget ? ' dragTarget' : ''}`}
                      layout
                      transition={spring}
                      draggable
                      onDragStart={(e) => mulaiDragBlock(block.id, e)}
                      onDragEnd={selesaiDragBlock}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        saatDragMasukBlock(block.id);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        selesaiDragBlock();
                      }}
                    >
                      <div className="blockHead">
                        <div className="blockDrag">#{idx + 1}</div>
                        <div className="blockTitle">{block.jenis}</div>
                        <button type="button" className="blockDelete" onClick={() => hapusBlock(block.id)}>Remove</button>
                      </div>

                      {block.jenis === 'delay' ? (
                        <div className="durationGrid">
                          <input className="input" inputMode="numeric" placeholder="hours" value={block.jam} onChange={(e) => updateBlock(block.id, { jam: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                          <input className="input" inputMode="numeric" placeholder="minutes" value={block.menit} onChange={(e) => updateBlock(block.id, { menit: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
                          <input className="input" inputMode="numeric" placeholder="seconds" value={block.detik} onChange={(e) => updateBlock(block.id, { detik: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
                        </div>
                      ) : null}

                      {block.jenis === 'wait_reply' ? (
                        <>
                          <select className="select" value={block.mode} onChange={(e) => updateBlock(block.id, { mode: e.target.value as 'any' | 'exact' })}>
                            <option value="any">Wait for any reply</option>
                            <option value="exact">Wait for exact reply</option>
                          </select>
                          {block.mode === 'exact' ? (
                            <input className="input" placeholder="Expected exact text" value={block.expectedText} onChange={(e) => updateBlock(block.id, { expectedText: e.target.value })} />
                          ) : null}
                        </>
                      ) : null}

                      {block.jenis === 'send_message' ? (
                        <textarea className="textarea" placeholder="Message text" value={block.pesan} onChange={(e) => updateBlock(block.id, { pesan: e.target.value })} />
                      ) : null}
                    </motion.div>
                  );
                  })}
                </div>
                <div className="blockActions">
                  <motion.button type="button" className="btn btnGhost" whileTap={reduceMotion ? undefined : { scale: 0.98 }} onClick={tambahBlockDelay}>+ Delay</motion.button>
                  <motion.button type="button" className="btn btnGhost" whileTap={reduceMotion ? undefined : { scale: 0.98 }} onClick={tambahBlockWaitReply}>+ Wait Reply</motion.button>
                  <motion.button type="button" className="btn btnGhost" whileTap={reduceMotion ? undefined : { scale: 0.98 }} onClick={tambahBlockSendMessage}>+ Send Message</motion.button>
                </div>
                <div className="blockHint">Drag each block to reorder the flow.</div>

                <div className="spacer12" />
                <motion.button type="button" className="btn btnPrimary btnWide" whileTap={reduceMotion ? undefined : { scale: 0.98 }} disabled={isSubmittingSend} onClick={() => void handleSubmitSendMessage()}>
                  {isSubmittingSend ? 'Saving schedule' : 'Submit send message'}
                </motion.button>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>

        <motion.section className="surfaceCard cardBody" layout transition={spring}>
          <div className="row">
            <div>
              <h2 className="titleCard">Job Queue</h2>
              <div className="metaText">Latest Jobs</div>
            </div>
            <div className="row">
              <span className="badge">{jobs.length}</span>
              <motion.button type="button" className="btn btnGhost" whileTap={reduceMotion ? undefined : { scale: 0.98 }} disabled={jumlahSelesai === 0} onClick={async () => {
                try {
                  const jumlah = await hapusJobSelesai();
                  setToast(jumlah > 0 ? `${jumlah} completed jobs removed` : 'No completed jobs yet');
                  await muatSemua();
                } catch (err) {
                  setToast(ambilPesanError(err));
                }
              }}>
                {jumlahSelesai > 0 ? `Clear done (${jumlahSelesai})` : 'Clear done'}
              </motion.button>
            </div>
          </div>

          <div className="jobsList">
            <AnimatePresence mode="popLayout">
              {jobs.length ? jobs.map((job) => {
                const jenis = job.jenis || 'wa_status';
                const meta = jenis === 'send_message' && job.sendMessage
                  ? `Target ${formatWaktu(job.targetMs)}\nTo ${job.sendMessage.nomorTujuan}\n${ringkasProgressSendMessage(job)}${job.terakhirError ? `\nError ${job.terakhirError}` : ''}`
                  : `Target ${formatWaktu(job.targetMs)}\nAttempt ${job.attemptCount}${job.berikutnyaCobaMs ? `\nNext ${formatWaktu(job.berikutnyaCobaMs)}` : ''}${job.terakhirError ? `\nError ${job.terakhirError}` : ''}`;

                return (
                  <motion.div key={job.id} className="jobItem" layout initial={reduceMotion ? undefined : { opacity: 0, y: 8, filter: 'blur(8px)' }} animate={reduceMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={spring}>
                    <div className="jobTitle">#{job.id} [{jenis}] {job.status}</div>
                    <div className="jobMeta">{meta}</div>
                    {job.status !== 'success' && job.status !== 'cancel' ? (
                      <motion.button type="button" className="btn btnDangerSoft" whileTap={reduceMotion ? undefined : { scale: 0.98 }} onClick={async () => {
                        try {
                          await batalkanJob(job.id);
                          setToast('Job cancelled');
                          await muatSemua();
                        } catch (err) {
                          setToast(ambilPesanError(err));
                        }
                      }}>
                        Cancel
                      </motion.button>
                    ) : null}
                  </motion.div>
                );
              }) : (
                <motion.div key="empty" className="metaText" initial={reduceMotion ? undefined : { opacity: 0 }} animate={reduceMotion ? undefined : { opacity: 1 }}>
                  No Jobs Yet
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.section>
      </motion.main>

      <AnimatePresence>
        {toast ? (
          <motion.div className="toast" initial={reduceMotion ? undefined : { opacity: 0, y: 16, filter: 'blur(8px)' }} animate={reduceMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }} exit={reduceMotion ? undefined : { opacity: 0, y: 10 }} transition={spring}>
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const host = document.getElementById('app-dashboard');
if (host) createRoot(host).render(<DashboardApp />);

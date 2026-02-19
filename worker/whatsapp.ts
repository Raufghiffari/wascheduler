// worker/whatsapp.ts
// Modul koneksi Baileys + helper kirim WhatsApp Status/Direct Message.

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import P from 'pino';
import { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  useMultiFileAuthState,
  jidNormalizedUser,
} from '@whiskeysockets/baileys';

import type { AnyMessageContent } from '@whiskeysockets/baileys';
import type { InfoMedia, JobSchedule, JobScheduleWaStatus, TipeAudience } from '../shared/tipe';
import { ubahDatabase } from '../db/penyimpanan';
import { tambahLog, ubahPathRelatifKeAbsolut, buatStatusWaAwal } from '../db/penyimpanan';
import { ubahNomorKeJid } from '../shared/util-nomor';
import { sekarangMs } from '../shared/util-waktu';
import { resolveDeveloperCommand } from '../shared/developer-command';

const batasSimpanPesanPerJid = 200;

export type PesanPribadiMasuk = {
  jid: string;
  teks: string;
  waktuMs: number;
};

export type OpsiKirimPesanLangsung = {
  jobId: string;
  nomorTujuan: string;
  pesan: string;
  media?: InfoMedia;
  tahap: 'initial' | 'block';
  blockIndex?: number;
  attemptKe: number;
};

type HandlerPesanPribadi = (pesan: PesanPribadiMasuk) => void;

// Fungsi ini bikin logger pino sesuai env LOG_LEVEL.
function buatLogger() {
  const level = process.env.LOG_LEVEL || 'info';
  return P({ level });
}

function normalisasiJid(jid: string): string {
  return jidNormalizedUser(String(jid || '')).toLowerCase();
}

async function resetFolderAuth(folderAuth: string): Promise<void> {
  await fs.rm(folderAuth, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 120,
  });
  await fs.mkdir(folderAuth, { recursive: true });
}

function ambilTeksPesanRaw(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const msg = message as Record<string, unknown>;

  const conversation = msg.conversation;
  if (typeof conversation === 'string' && conversation.trim()) return conversation.trim();

  const extended = msg.extendedTextMessage as { text?: unknown } | undefined;
  if (extended && typeof extended.text === 'string' && extended.text.trim()) return extended.text.trim();

  const image = msg.imageMessage as { caption?: unknown } | undefined;
  if (image && typeof image.caption === 'string' && image.caption.trim()) return image.caption.trim();

  const video = msg.videoMessage as { caption?: unknown } | undefined;
  if (video && typeof video.caption === 'string' && video.caption.trim()) return video.caption.trim();

  const ephemeral = msg.ephemeralMessage as { message?: unknown } | undefined;
  if (ephemeral?.message) return ambilTeksPesanRaw(ephemeral.message);

  const viewOnceV2 = msg.viewOnceMessageV2 as { message?: unknown } | undefined;
  if (viewOnceV2?.message) return ambilTeksPesanRaw(viewOnceV2.message);

  const viewOnce = msg.viewOnceMessage as { message?: unknown } | undefined;
  if (viewOnce?.message) return ambilTeksPesanRaw(viewOnce.message);

  return '';
}

function ambilWaktuPesanMs(messageTimestamp: unknown): number {
  const nilai = Number(messageTimestamp || 0);
  if (!Number.isFinite(nilai) || nilai <= 0) return sekarangMs();
  if (nilai > 1_000_000_000_000) return Math.floor(nilai);
  return Math.floor(nilai * 1000);
}

function apakahJobWaStatus(job: JobSchedule): job is JobScheduleWaStatus {
  if (job.jenis === 'send_message') return false;
  return Boolean((job as JobScheduleWaStatus).media && (job as JobScheduleWaStatus).audience);
}

// Fungsi ini menulis status WhatsApp ke DB (dipakai dashboard).
async function simpanStatusWa(
  userId: string,
  opsi: {
    status: 'mati' | 'menghubungkan' | 'terhubung' | 'logout';
    qr?: string | null;
    nomor?: string | null;
    catatan?: string | null;
  },
): Promise<void> {
  await ubahDatabase((db) => {
    if (!db.waByUser[userId]) {
      db.waByUser[userId] = buatStatusWaAwal();
    }

    const wa = db.waByUser[userId];
    wa.status = opsi.status;
    wa.qr = typeof opsi.qr === 'undefined' ? wa.qr : opsi.qr;
    wa.nomor = typeof opsi.nomor === 'undefined' ? wa.nomor : opsi.nomor;
    wa.catatan = typeof opsi.catatan === 'undefined' ? wa.catatan : opsi.catatan;
    wa.terakhirUpdateMs = sekarangMs();
  });

  await tambahLog('wa_status', { ...opsi }, userId);
}

export type PengirimWhatsapp = {
  userId: string;

  // Fungsi ini mengembalikan daftar JID kontak yang tersimpan di store.
  ambilKontakJid: () => string[];

  // Fungsi ini mengirim status media sesuai job.
  kirimStatusDariJob: (job: JobSchedule) => Promise<void>;

  // Fungsi ini mengirim pesan langsung ke 1 chat.
  kirimPesanLangsung: (opsi: OpsiKirimPesanLangsung) => Promise<void>;

  // Ambil daftar pesan private masuk sejak timestamp tertentu.
  daftarPesanPribadiSejak: (jid: string, sejakMs: number) => PesanPribadiMasuk[];

  // Callback realtime untuk pesan private masuk.
  onPesanPribadi: (handler: HandlerPesanPribadi) => () => void;
};

// Fungsi ini membangun koneksi WhatsApp untuk 1 user.
export async function sambungkanWhatsapp(userId: string): Promise<PengirimWhatsapp> {
  const logger = buatLogger();

  const rootAuth = process.env.WA_AUTH_DIR || 'wa_auth';
  const folderAuth = path.join(process.cwd(), rootAuth, userId);
  const folderStore = path.join(process.cwd(), 'db', 'wa-store');
  const lokasiStore = path.join(folderStore, `${userId}.json`);

  await fs.mkdir(folderAuth, { recursive: true });
  await fs.mkdir(folderStore, { recursive: true });

  // In-memory store untuk menyimpan kontak (dibutuhkan untuk audience "my contacts").
  const store = makeInMemoryStore({ logger });
  try {
    // Store ini optional, tapi membantu supaya kontak tersimpan setelah restart.
    await fs.access(lokasiStore);
    store.readFromFile(lokasiStore);
  } catch {
    // abaikan kalau belum ada
  }

  const inboxPribadi = new Map<string, PesanPribadiMasuk[]>();
  const handlerPesanPribadi = new Set<HandlerPesanPribadi>();

  function simpanPesanPribadiMasuk(pesan: PesanPribadiMasuk): void {
    const key = normalisasiJid(pesan.jid);
    const daftar = inboxPribadi.get(key) || [];
    daftar.push(pesan);
    if (daftar.length > batasSimpanPesanPerJid) {
      daftar.splice(0, daftar.length - batasSimpanPesanPerJid);
    }
    inboxPribadi.set(key, daftar);
    for (const handler of handlerPesanPribadi) {
      try {
        handler(pesan);
      } catch {
        // abaikan error handler supaya listener lain tetap jalan
      }
    }
  }

  function daftarPesanPribadiSejak(jid: string, sejakMs: number): PesanPribadiMasuk[] {
    const key = normalisasiJid(jid);
    const daftar = inboxPribadi.get(key) || [];
    return daftar.filter((item) => item.waktuMs >= sejakMs);
  }

  function onPesanPribadi(handler: HandlerPesanPribadi): () => void {
    handlerPesanPribadi.add(handler);
    return () => {
      handlerPesanPribadi.delete(handler);
    };
  }

  setInterval(() => {
    store.writeToFile(lokasiStore);
  }, 10_000);

  // Koneksi socket (dibikin ulang saat reconnect).
  let sock = await buatSocket();
  let sedangResetLogout = false;

  // Bind store ke event emitter.
  store.bind(sock.ev);

  async function buatSocket() {
    // Fungsi ini membuat socket Baileys + set event handler dasar.
    await simpanStatusWa(userId, { status: 'menghubungkan', qr: null, catatan: 'Membuat socket baru...' });

    const { state, saveCreds } = await useMultiFileAuthState(folderAuth);

    // Versi WA Web terbaru (biar lebih tahan update).
    const { version } = await fetchLatestBaileysVersion();

    const s = makeWASocket({
      version,
      logger,
      auth: state,
      // Print QR di terminal (butuh dependency `qrcode-terminal`).
      // Dashboard tetap akan dapat QR juga dari event `connection.update`.
      printQRInTerminal: true,
      syncFullHistory: true,
      browser: ['StatusScheduler', 'Chrome', '1.0.0'],
    });

    s.ev.on('creds.update', saveCreds);

    s.ev.on('messages.upsert', async (event: unknown) => {
      const payload = event as { messages?: Array<any> };
      const daftarPesan = Array.isArray(payload.messages) ? payload.messages : [];

      for (const item of daftarPesan) {
        const remoteJidRaw = String(item?.key?.remoteJid || '').trim();
        const remoteJid = normalisasiJid(remoteJidRaw);
        const fromMe = Boolean(item?.key?.fromMe);
        if (!remoteJid || !remoteJid.endsWith('@s.whatsapp.net') || fromMe) continue;

        const teks = ambilTeksPesanRaw(item?.message);
        if (!teks) continue;

        const waktuMs = ambilWaktuPesanMs(item?.messageTimestamp);
        const pesanMasuk: PesanPribadiMasuk = {
          jid: remoteJid,
          teks,
          waktuMs,
        };

        simpanPesanPribadiMasuk(pesanMasuk);
        await tambahLog('wa_pesan_masuk', pesanMasuk, userId).catch(() => null);
      }
    });

    s.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        await simpanStatusWa(userId, { status: 'menghubungkan', qr, catatan: 'Scan QR di authorize page.' });
      }

      if (connection === 'open') {
        const nomor = s.user?.id ? jidNormalizedUser(s.user.id) : null;
        await simpanStatusWa(userId, { status: 'terhubung', qr: null, nomor, catatan: 'Terhubung.' });
      }

      if (connection === 'close') {
        const kode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const logout = kode === DisconnectReason.loggedOut;

        if (logout) {
          if (sedangResetLogout) return;
          sedangResetLogout = true;

          await simpanStatusWa(userId, {
            status: 'menghubungkan',
            qr: null,
            catatan: 'Perangkat logout. Reset sesi otomatis lalu buat QR baru...',
          });

          try {
            await resetFolderAuth(folderAuth);
            await tambahLog('wa_status', {
              status: 'menghubungkan',
              catatan: 'Folder wa_auth user dihapus otomatis karena logout.',
            }, userId).catch(() => null);
          } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            await simpanStatusWa(userId, {
              status: 'menghubungkan',
              qr: null,
              catatan: `Gagal reset sesi otomatis: ${detail}. Mencoba buat QR baru...`,
            });
          }

          try {
            sock = await buatSocket();
            store.bind(sock.ev);
          } finally {
            sedangResetLogout = false;
          }
          return;
        }

        await simpanStatusWa(userId, {
          status: 'menghubungkan',
          qr: null,
          catatan: 'Putus, mencoba reconnect...',
        });

        // Reconnect
        sock = await buatSocket();
        store.bind(sock.ev);
      }
    });

    return s;
  }

  function ambilKontakJid(): string[] {
    // Fungsi ini mengambil semua contact JID dari store.
    const semua = Object.keys(store.contacts || {});
    const hasil = semua
      .map((jid) => jidNormalizedUser(jid))
      .filter((jid) => jid.endsWith('@s.whatsapp.net'));

    // Hilangkan duplikat.
    return Array.from(new Set(hasil));
  }

  function ambilDaftarPenerima(job: JobScheduleWaStatus): string[] {
    // Fungsi ini menentukan audience final berdasarkan rule di job.
    const tipe = job.audience.tipe as TipeAudience;
    const self = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;

    const semuaKontak = ambilKontakJid();

    // Default: minimal self supaya status juga muncul di device sendiri.
    const dasar = self ? [self] : [];

    if (tipe === 'developer_command') {
      return resolveDeveloperCommand(job.audience.command || '', semuaKontak, self);
    }

    if (tipe === 'only_share_with') {
      const daftarNomor = job.audience.daftarNomor || [];
      const jids = daftarNomor.map(ubahNomorKeJid).filter(Boolean) as string[];
      return Array.from(new Set([...dasar, ...jids]));
    }

    if (tipe === 'my_contacts_excluded') {
      const daftarNomor = job.audience.daftarNomor || [];
      const exclude = new Set((daftarNomor.map(ubahNomorKeJid).filter(Boolean) as string[]).map(jidNormalizedUser));
      const disaring = semuaKontak.filter((jid) => !exclude.has(jidNormalizedUser(jid)));
      return Array.from(new Set([...dasar, ...disaring]));
    }

    // my_contacts
    return Array.from(new Set([...dasar, ...semuaKontak]));
  }

  async function kirimStatusDariJob(job: JobSchedule): Promise<void> {
    if (!apakahJobWaStatus(job)) {
      throw new Error('Job bukan tipe wa_status.');
    }

    // Fungsi ini mengirim WhatsApp Status berdasarkan isi job.
    const penerima = ambilDaftarPenerima(job);

    if (!penerima.length) {
      throw new Error(
        'Daftar penerima kosong. Pastikan WhatsApp sudah terhubung dan kontak sudah tersinkron.',
      );
    }

    const pathAbsolut = ubahPathRelatifKeAbsolut(job.media.pathRelatif);

    const konten: AnyMessageContent =
      job.media.tipe === 'foto'
        ? { image: { url: pathAbsolut }, caption: job.caption || undefined }
        : { video: { url: pathAbsolut }, caption: job.caption || undefined };

    // Payload lengkap buat kebutuhan logging/monitoring.
    const payloadLengkap = {
      jobId: job.id,
      targetMs: job.targetMs,
      attemptCount: job.attemptCount,
      media: job.media,
      caption: job.caption || '',
      audience: job.audience,
      penerimaTotal: penerima.length,
    };

    await tambahLog('kirim_status_mulai', payloadLengkap, userId);

    // Kirim ke status broadcast.
    // Note: banyak laporan bahwa `statusJidList` dibutuhkan supaya status muncul.
    await sock.sendMessage('status@broadcast', konten, {
      statusJidList: penerima,
      broadcast: true,
    } as any);

    await tambahLog('kirim_status_sukses', payloadLengkap, userId);
  }

  async function kirimPesanLangsung(opsi: OpsiKirimPesanLangsung): Promise<void> {
    const jidTujuan = ubahNomorKeJid(opsi.nomorTujuan);
    if (!jidTujuan) {
      throw new Error('Nomor tujuan tidak valid.');
    }

    const pesan = String(opsi.pesan || '').trim();
    if (!pesan) {
      throw new Error('Pesan kosong.');
    }

    const payloadLog = {
      jobId: opsi.jobId,
      nomorTujuan: opsi.nomorTujuan,
      jidTujuan,
      tahap: opsi.tahap,
      blockIndex: opsi.blockIndex,
      attemptKe: opsi.attemptKe,
      media: opsi.media || null,
      pesan,
    };

    await tambahLog('kirim_pesan_mulai', payloadLog, userId);

    try {
      let konten: AnyMessageContent;
      if (opsi.media) {
        const pathAbsolut = ubahPathRelatifKeAbsolut(opsi.media.pathRelatif);
        konten =
          opsi.media.tipe === 'foto'
            ? { image: { url: pathAbsolut }, caption: pesan }
            : { video: { url: pathAbsolut }, caption: pesan };
      } else {
        konten = { text: pesan };
      }

      await sock.sendMessage(jidTujuan, konten);
      await tambahLog('kirim_pesan_sukses', payloadLog, userId);
    } catch (err) {
      const detailError = err instanceof Error ? err.message : String(err);
      await tambahLog('kirim_pesan_gagal', {
        ...payloadLog,
        error: detailError,
      }, userId).catch(() => null);
      throw err;
    }
  }

  return {
    userId,
    ambilKontakJid,
    kirimStatusDariJob,
    kirimPesanLangsung,
    daftarPesanPribadiSejak,
    onPesanPribadi,
  };
}

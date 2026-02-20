
import express from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import path from 'path';
import fs from 'fs/promises';

import { bacadtbs, ubhdtbs, ubhpthrltfkeabslt } from '../db/penyimpanan';
import { tmbhlog } from '../db/penyimpanan';
import { hshpsswrd } from '../shared/password';
import {
  amblaccsscodergstr,
  amblusrsssn,
  atntksusr,
  tndlgn,
  tndlgt,
  bthlgn,
  tntknrutestlhlgn,
} from './auth';
import { buatupldrmedia, rpknmimetyp, tbktipemedia } from './upload';
import type {
  AkunUser,
  BlokSendMessage,
  DurasiKecil,
  InfoAudience,
  InfoMedia,
  InfoSendMessage,
  JobSchedule,
  StatusJob,
  StrukturDatabase,
  TipeAudience,
} from '../shared/tipe';
import { buatjndlpngrmn, skrngms, ubhdrskems } from '../shared/util-waktu';
import { pchdftrnmr, rpknnmr } from '../shared/util-nomor';
import { nrmlssdvlprcmmnd } from '../shared/developer-command';

const router = express.Router();
const uploader = buatupldrmedia();

const skemaLogin = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const skemaRegister = z.object({
  name: z.string().min(1).max(64),
  password: z.string().min(4).max(200),
  developerAccess: z.string().min(1).max(200),
  encryptor: z.string().max(200).optional().default(''),
});

const skemaDurasi = z.object({
  jam: z.coerce.number().int().min(0).max(999).default(0),
  menit: z.coerce.number().int().min(0).max(59).default(0),
  detik: z.coerce.number().int().min(0).max(59).default(0),
});

const skemaMedia = z.object({
  namaAsli: z.string().min(1),
  pathRelatif: z.string().min(1),
  mime: z.string().min(1),
  tipe: z.enum(['foto', 'video']),
  ukuranByte: z.coerce.number().int().min(1),
});

const skemaAudience = z.object({
  tipe: z.enum(['my_contacts', 'my_contacts_excluded', 'only_share_with', 'developer_command']),
  daftarNomor: z.array(z.string()).optional(),
  command: z.string().optional(),
});

const skemaBuatJobStatus = z.object({
  jenis: z.literal('wa_status').optional(),
  durasi: skemaDurasi,
  media: skemaMedia,
  caption: z.string().max(2000).optional().default(''),
  audience: skemaAudience,
});

const skemaBlokDelay = z.object({
  id: z.string().min(1).max(80).optional(),
  jenis: z.literal('delay'),
  durasi: skemaDurasi,
});

const skemaBlokWaitReply = z.object({
  id: z.string().min(1).max(80).optional(),
  jenis: z.literal('wait_reply'),
  mode: z.enum(['any', 'exact']).default('any'),
  expectedText: z.string().max(2000).optional(),
});

const skemaBlokKirimPesan = z.object({
  id: z.string().min(1).max(80).optional(),
  jenis: z.literal('send_message'),
  pesan: z.string().min(1).max(2000),
});

const skemaBlokSendMessage = z.discriminatedUnion('jenis', [
  skemaBlokDelay,
  skemaBlokWaitReply,
  skemaBlokKirimPesan,
]);

const skemaSendMessage = z.object({
  nomorTujuan: z.string().min(1),
  pesanAwal: z.string().min(1).max(2000),
  media: skemaMedia.optional(),
  blok: z.array(skemaBlokSendMessage).max(80).default([]),
});

const skemaBuatJobSendMessage = z.object({
  jenis: z.literal('send_message'),
  durasi: skemaDurasi,
  sendMessage: skemaSendMessage,
});

const skemaBuatJobGabungan = z.union([skemaBuatJobStatus, skemaBuatJobSendMessage]);

function rpknsttsjob(status: StatusJob): StatusJob {
  const daftar: StatusJob[] = ['queued', 'running', 'success', 'failed', 'cancel'];
  return daftar.includes(status) ? status : 'queued';
}

function urtknjobtrbrdulu(a: JobSchedule, b: JobSchedule): number {
  return b.dibuatPadaMs - a.dibuatPadaMs;
}

type HandlerAsync = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => Promise<void>;

function bngksasync(handler: HandlerAsync): express.RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

function drslbhdarinol(d: DurasiKecil): boolean {
  return ubhdrskems(d.jam, d.menit, d.detik) > 0;
}

function nrmlssnamausr(raw: string): string {
  return String(raw || '').trim();
}

function nrmlssnamausrlwr(raw: string): string {
  return nrmlssnamausr(raw).toLowerCase();
}

function buatidusrunk(nameLower: string, daftar: AkunUser[]): string {
  const slug = nameLower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'user';
  const dasar = `usr_${slug}`;
  const terpakai = new Set(daftar.map((u) => u.id));
  let kandidat = dasar;
  let idx = 2;
  while (terpakai.has(kandidat)) {
    kandidat = `${dasar}_${idx}`;
    idx += 1;
  }
  return kandidat;
}

function amblsssnwjb(req: express.Request, res: express.Response): {
  userId: string;
  username: string;
} | null {
  const sessionUser = amblusrsssn(req);
  if (sessionUser) return sessionUser;

  res.status(401).json({ ok: false, pesan: 'Belum login.' });
  return null;
}

function nrmlssdrs(d: DurasiKecil): DurasiKecil {
  return {
    jam: Math.max(0, Math.floor(Number(d.jam || 0))),
    menit: Math.max(0, Math.floor(Number(d.menit || 0))),
    detik: Math.max(0, Math.floor(Number(d.detik || 0))),
  };
}

async function pstknfilemediaada(media: InfoMedia): Promise<boolean> {
  const pathAbsolut = path.join(process.cwd(), media.pathRelatif);
  try {
    await fs.access(pathAbsolut);
    return true;
  } catch {
    return false;
  }
}

function ambldftrpthmedia(job: JobSchedule): string[] {
  const daftar = new Set<string>();

  if (job.media?.pathRelatif) {
    daftar.add(job.media.pathRelatif);
  }

  if (job.jenis === 'send_message' && job.sendMessage?.media?.pathRelatif) {
    daftar.add(job.sendMessage.media.pathRelatif);
  }

  return [...daftar];
}

function jbsls(job: JobSchedule): boolean {
  return job.status === 'success' || job.status === 'cancel';
}

async function autoadptmediajbs(daftarJobSelesai: JobSchedule[]): Promise<void> {
  if (daftarJobSelesai.length === 0) return;

  const db = await bacadtbs();
  const dipakaiAktif = new Set<string>();
  for (const job of db.job) {
    if (jbsls(job)) continue;
    for (const pathRelatif of ambldftrpthmedia(job)) {
      dipakaiAktif.add(pathRelatif);
    }
  }

  const kandidatHapus = new Set<string>();
  for (const job of daftarJobSelesai) {
    for (const pathRelatif of ambldftrpthmedia(job)) {
      kandidatHapus.add(pathRelatif);
    }
  }

  for (const pathRelatif of kandidatHapus) {
    if (dipakaiAktif.has(pathRelatif)) continue;
    try {
      await fs.unlink(ubhpthrltfkeabslt(pathRelatif));
    } catch {
    }
  }
}

export type InputAudienceBuatJob = z.infer<typeof skemaAudience>;

export function nrmlssadncbuatjob(input: InputAudienceBuatJob): {
  ok: true;
  audience: InfoAudience;
} | {
  ok: false;
  pesan: string;
} {
  const tipeAudience = input.tipe as TipeAudience;

  if (tipeAudience === 'developer_command') {
    const command = nrmlssdvlprcmmnd(input.command || '');
    if (!command) {
      return { ok: false, pesan: 'Developer command tidak valid.' };
    }

    return {
      ok: true,
      audience: {
        tipe: 'developer_command',
        command,
      },
    };
  }

  const daftarNomor = Array.isArray(input.daftarNomor) ? input.daftarNomor : [];
  const daftarNomorRapi = pchdftrnmr(daftarNomor.join('\n'));

  return {
    ok: true,
    audience: {
      tipe: tipeAudience,
      daftarNomor: daftarNomorRapi.length ? daftarNomorRapi : undefined,
    },
  };
}

export type InputBlokSendMessageBuatJob = z.infer<typeof skemaBlokSendMessage>;
export type InputSendMessageBuatJob = z.infer<typeof skemaSendMessage>;

function nrmlssblksndmssg(
  input: InputBlokSendMessageBuatJob[],
): { ok: true; blok: BlokSendMessage[] } | { ok: false; pesan: string } {
  const hasil: BlokSendMessage[] = [];

  for (const item of input) {
    const id = String(item.id || nanoid(8)).trim();
    if (!id) return { ok: false, pesan: 'ID block tidak valid.' };

    if (item.jenis === 'delay') {
      const durasi = nrmlssdrs(item.durasi);
      if (!drslbhdarinol(durasi)) {
        return { ok: false, pesan: 'Block delay harus lebih dari 0.' };
      }
      hasil.push({
        id,
        jenis: 'delay',
        durasi,
      });
      continue;
    }

    if (item.jenis === 'wait_reply') {
      const mode = item.mode === 'exact' ? 'exact' : 'any';
      const expectedText = String(item.expectedText || '').trim();
      if (mode === 'exact' && !expectedText) {
        return { ok: false, pesan: 'Block wait_reply exact harus punya expected text.' };
      }
      hasil.push({
        id,
        jenis: 'wait_reply',
        mode,
        expectedText: mode === 'exact' ? expectedText : undefined,
      });
      continue;
    }

    const pesan = String(item.pesan || '').trim();
    if (!pesan) {
      return { ok: false, pesan: 'Block send_message harus punya pesan.' };
    }
    hasil.push({
      id,
      jenis: 'send_message',
      pesan,
    });
  }

  return { ok: true, blok: hasil };
}

export function nrmlsssndmssgbuatjob(input: InputSendMessageBuatJob): {
  ok: true;
  sendMessage: InfoSendMessage;
} | {
  ok: false;
  pesan: string;
} {
  const nomorTujuan = rpknnmr(input.nomorTujuan);
  if (!nomorTujuan) {
    return { ok: false, pesan: 'Nomor tujuan tidak valid.' };
  }

  const pesanAwal = String(input.pesanAwal || '').trim();
  if (!pesanAwal) {
    return { ok: false, pesan: 'Pesan awal wajib diisi.' };
  }

  const normalisasiBlok = nrmlssblksndmssg(input.blok || []);
  if (!normalisasiBlok.ok) {
    return normalisasiBlok;
  }

  return {
    ok: true,
    sendMessage: {
      nomorTujuan,
      pesanAwal,
      media: input.media,
      blok: normalisasiBlok.blok,
      progress: {
        initialSent: false,
        nextBlockIndex: 0,
        pendingSend: {
          tahap: 'initial',
          retryCount: 0,
        },
      },
    },
  };
}


router.post('/login', express.json(), bngksasync(async (req, res) => {
  const parse = skemaLogin.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ ok: false, pesan: 'Format login tidak valid.' });
    return;
  }

  const { username, password } = parse.data;
  const user = await atntksusr(username, password);
  if (!user) {
    res.status(401).json({ ok: false, pesan: 'Username/password salah.' });
    return;
  }

  await tndlgn(req, { id: user.id, name: user.name });
  const nextRoute = await tntknrutestlhlgn(user.id);
  res.json({ ok: true, nextRoute });
}));

router.post('/register', express.json(), bngksasync(async (req, res) => {
  const parse = skemaRegister.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ ok: false, pesan: 'Format register tidak valid.' });
    return;
  }

  const name = nrmlssnamausr(parse.data.name);
  const nameLower = nrmlssnamausrlwr(name);
  const password = String(parse.data.password || '');
  const encryptor = String(parse.data.encryptor || '').trim() || nanoid(24);
  const developerAccess = String(parse.data.developerAccess || '').trim();

  if (!nameLower || name.length < 3) {
    res.status(400).json({ ok: false, pesan: 'Nama user minimal 3 karakter.' });
    return;
  }

  if (developerAccess !== amblaccsscodergstr()) {
    res.status(401).json({ ok: false, pesan: 'Developer access salah.' });
    return;
  }

  let userBaruId = '';
  let userBaruName = '';
  await ubhdtbs(async (db) => {
    const sudahAda = db.users.some((user) => user.nameLower === nameLower);
    if (sudahAda) {
      throw new Error('Nama user sudah dipakai.');
    }

    const id = buatidusrunk(nameLower, db.users);
    const passwordHash = await hshpsswrd(password);

    const userBaru: AkunUser = {
      id,
      name,
      nameLower,
      passwordHash,
      encryptor,
      createdAtMs: skrngms(),
      source: 'register',
    };

    db.users.push(userBaru);
    userBaruId = userBaru.id;
    userBaruName = userBaru.name;
    if (!db.waByUser[id]) {
      db.waByUser[id] = {
        status: 'mati',
        qr: null,
        terakhirUpdateMs: skrngms(),
        nomor: null,
        catatan: null,
      };
    }
  });

  if (!userBaruId || !userBaruName) {
    res.status(500).json({ ok: false, pesan: 'Gagal membuat user.' });
    return;
  }

  const rootAuth = process.env.WA_AUTH_DIR || 'wa_auth';
  await fs.mkdir(path.join(process.cwd(), rootAuth, userBaruId), { recursive: true });
  await fs.mkdir(path.join(process.cwd(), 'media', userBaruId), { recursive: true });
  await fs.mkdir(path.join(process.cwd(), 'db', 'wa-store'), { recursive: true });

  await tndlgn(req, { id: userBaruId, name: userBaruName });
  await tmbhlog(
    'register_user',
    {
      username: userBaruName,
      source: 'register',
    },
    userBaruId,
  );

  res.json({
    ok: true,
    nextRoute: '/authorize',
  });
}));

router.get('/session', bthlgn, bngksasync(async (req, res) => {
  const sessionUser = amblsssnwjb(req, res);
  if (!sessionUser) return;

  const nextRoute = await tntknrutestlhlgn(sessionUser.userId);
  res.json({
    ok: true,
    session: sessionUser,
    nextRoute,
  });
}));

router.post('/logout', bngksasync(async (req, res) => {
  await tndlgt(req);
  req.session.destroy(() => {
    res.json({ ok: true });
  });
}));


router.get('/wa/status', bthlgn, bngksasync(async (req, res) => {
  const sessionUser = amblsssnwjb(req, res);
  if (!sessionUser) return;

  const db = await bacadtbs();
  const wa = db.waByUser[sessionUser.userId] || {
    status: 'mati',
    qr: null,
    nomor: null,
    catatan: null,
    terakhirUpdateMs: skrngms(),
  };

  let qrDataUrl: string | null = null;
  if (wa.qr) {
    try {
      qrDataUrl = await QRCode.toDataURL(wa.qr, { margin: 1, width: 280 });
    } catch {
      qrDataUrl = null;
    }
  }

  res.json({
    ok: true,
    wa: {
      ...wa,
      qr: null,
      qrDataUrl,
    },
  });
}));


router.post('/upload', bthlgn, uploader.single('media'), bngksasync(async (req, res) => {
  const sessionUser = amblsssnwjb(req, res);
  if (!sessionUser) return;

  const file = req.file;
  if (!file) {
    res.status(400).json({ ok: false, pesan: 'Tidak ada file.' });
    return;
  }

  const mimeType = rpknmimetyp(file.originalname, file.mimetype);
  const tipe = tbktipemedia(mimeType);

  if (!tipe) {
    res.status(400).json({ ok: false, pesan: 'File harus foto/video.' });
    return;
  }

  const pathRelatif = path.join('media', sessionUser.userId, file.filename).replace(/\\/g, '/');

  const media: InfoMedia = {
    namaAsli: file.originalname,
    pathRelatif,
    mime: mimeType,
    tipe,
    ukuranByte: file.size,
  };

  await tmbhlog('upload_media', { media }, sessionUser.userId);

  res.json({ ok: true, media });
}));


router.get('/jobs', bthlgn, bngksasync(async (req, res) => {
  const sessionUser = amblsssnwjb(req, res);
  if (!sessionUser) return;

  const db = await bacadtbs();
  const daftar = [...db.job]
    .filter((job) => job.userId === sessionUser.userId)
    .sort(urtknjobtrbrdulu);
  res.json({ ok: true, job: daftar });
}));

router.get('/log', bthlgn, bngksasync(async (req, res) => {
  const sessionUser = amblsssnwjb(req, res);
  if (!sessionUser) return;

  const db = await bacadtbs();
  const daftarLog = db.log.filter((baris) => !baris.userId || baris.userId === sessionUser.userId);
  res.json({ ok: true, log: daftarLog });
}));

router.post('/jobs', bthlgn, express.json(), bngksasync(async (req, res) => {
  const sessionUser = amblsssnwjb(req, res);
  if (!sessionUser) return;

  const parse = skemaBuatJobGabungan.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ ok: false, pesan: 'Data job tidak valid.' });
    return;
  }

  const durasiMs = ubhdrskems(parse.data.durasi.jam, parse.data.durasi.menit, parse.data.durasi.detik);
  if (durasiMs <= 0) {
    res.status(400).json({ ok: false, pesan: 'Durasi harus lebih dari 0.' });
    return;
  }

  const now = skrngms();
  const targetMs = now + durasiMs;
  const jendela = buatjndlpngrmn(targetMs);

  if (parse.data.jenis === 'send_message') {
    const normalisasiSendMessage = nrmlsssndmssgbuatjob(parse.data.sendMessage);
    if (!normalisasiSendMessage.ok) {
      res.status(400).json({ ok: false, pesan: normalisasiSendMessage.pesan });
      return;
    }

    const mediaOpsional = normalisasiSendMessage.sendMessage.media;
    if (mediaOpsional) {
      const fileAda = await pstknfilemediaada(mediaOpsional);
      if (!fileAda) {
        res.status(400).json({ ok: false, pesan: 'File media tidak ditemukan di server.' });
        return;
      }
    }

    const job: JobSchedule = {
      id: nanoid(12),
      userId: sessionUser.userId,
      dibuatPadaMs: now,
      jenis: 'send_message',
      targetMs,
      jendela,
      status: rpknsttsjob('queued'),
      sendMessage: normalisasiSendMessage.sendMessage,
      attemptCount: 0,
      terakhirAttemptMs: undefined,
      berikutnyaCobaMs: undefined,
      terakhirError: undefined,
      selesaiMs: undefined,
    };

    await ubhdtbs((db: StrukturDatabase) => {
      db.job.push(job);
    });

    await tmbhlog('buat_job', {
      id: job.id,
      jenis: 'send_message',
      targetMs: job.targetMs,
      sendMessage: job.sendMessage,
    }, sessionUser.userId);

    res.json({ ok: true, job });
    return;
  }

  const normalisasiAudience = nrmlssadncbuatjob(parse.data.audience);
  if (!normalisasiAudience.ok) {
    res.status(400).json({ ok: false, pesan: normalisasiAudience.pesan });
    return;
  }

  const fileAda = await pstknfilemediaada(parse.data.media);
  if (!fileAda) {
    res.status(400).json({ ok: false, pesan: 'File media tidak ditemukan di server.' });
    return;
  }

  const job: JobSchedule = {
    id: nanoid(12),
    userId: sessionUser.userId,
    dibuatPadaMs: now,
    jenis: 'wa_status',
    targetMs,
    jendela,
    status: rpknsttsjob('queued'),
    media: parse.data.media,
    caption: (parse.data.caption || '').trim(),
    audience: normalisasiAudience.audience,
    attemptCount: 0,
    terakhirAttemptMs: undefined,
    berikutnyaCobaMs: undefined,
    terakhirError: undefined,
    selesaiMs: undefined,
  };

  await ubhdtbs((db: StrukturDatabase) => {
    db.job.push(job);
  });

  await tmbhlog('buat_job', {
    id: job.id,
    jenis: 'wa_status',
    targetMs: job.targetMs,
    jendela: job.jendela,
    media: job.media,
    caption: job.caption,
    audience: job.audience,
  }, sessionUser.userId);

  res.json({ ok: true, job });
}));

router.post('/jobs/:id/cancel', bthlgn, bngksasync(async (req, res) => {
  const sessionUser = amblsssnwjb(req, res);
  if (!sessionUser) return;

  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ ok: false, pesan: 'ID job kosong.' });
    return;
  }

  let ketemu: JobSchedule | null = null;

  await ubhdtbs((db) => {
    const job = db.job.find((j) => j.id === id && j.userId === sessionUser.userId);
    if (!job) return;

    if (job.status === 'success') return;
    job.status = 'cancel';
    job.selesaiMs = skrngms();
    ketemu = job;
  });

  if (!ketemu) {
    res.status(404).json({ ok: false, pesan: 'Job tidak ditemukan.' });
    return;
  }

  await tmbhlog('cancel_job', { id }, sessionUser.userId);
  await autoadptmediajbs([ketemu]);

  res.json({ ok: true, job: ketemu });
}));

router.post('/jobs/clear-completed', bthlgn, bngksasync(async (req, res) => {
  const sessionUser = amblsssnwjb(req, res);
  if (!sessionUser) return;

  let jumlahDihapus = 0;
  let daftarJobSelesai: JobSchedule[] = [];

  await ubhdtbs((db) => {
    daftarJobSelesai = db.job.filter(
      (job) => job.userId === sessionUser.userId && (job.status === 'success' || job.status === 'cancel'),
    );
    const sebelum = db.job.filter((job) => job.userId === sessionUser.userId).length;
    db.job = db.job.filter((job) => {
      if (job.userId !== sessionUser.userId) return true;
      return job.status !== 'success' && job.status !== 'cancel';
    });
    const sesudah = db.job.filter((job) => job.userId === sessionUser.userId).length;
    jumlahDihapus = sebelum - sesudah;
  });

  if (jumlahDihapus > 0) {
    await tmbhlog('hapus_job_selesai', { jumlahDihapus }, sessionUser.userId);
    await autoadptmediajbs(daftarJobSelesai);
  }

  res.json({ ok: true, jumlahDihapus });
}));

export function buatrtrapi(): express.Router {
  return router;
}

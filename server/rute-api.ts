// server/rute-api.ts
// Semua endpoint JSON untuk dashboard.

import express from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import path from 'path';
import fs from 'fs/promises';

import { bacaDatabase, ubahDatabase } from '../db/penyimpanan';
import { tambahLog } from '../db/penyimpanan';
import { hashPassword } from '../shared/password';
import {
  ambilAccessCodeRegister,
  ambilUserSession,
  autentikasiUser,
  tandaiLogin,
  tandaiLogout,
  butuhLogin,
  tentukanRuteSetelahLogin,
} from './auth';
import { buatUploaderMedia, rapikanMimeType, tebakTipeMedia } from './upload';
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
import { buatJendelaPengiriman, sekarangMs, ubahDurasiKeMs } from '../shared/util-waktu';
import { pecahDaftarNomor, rapikanNomor } from '../shared/util-nomor';
import { normalisasiDeveloperCommand } from '../shared/developer-command';

const router = express.Router();
const uploader = buatUploaderMedia();

// Validasi body login.
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

// Validasi durasi.
const skemaDurasi = z.object({
  jam: z.coerce.number().int().min(0).max(999).default(0),
  menit: z.coerce.number().int().min(0).max(59).default(0),
  detik: z.coerce.number().int().min(0).max(59).default(0),
});

// Validasi media dari hasil upload.
const skemaMedia = z.object({
  namaAsli: z.string().min(1),
  pathRelatif: z.string().min(1),
  mime: z.string().min(1),
  tipe: z.enum(['foto', 'video']),
  ukuranByte: z.coerce.number().int().min(1),
});

// Validasi audience.
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

// Fungsi ini merapikan status job supaya konsisten.
function rapikanStatusJob(status: StatusJob): StatusJob {
  const daftar: StatusJob[] = ['queued', 'running', 'success', 'failed', 'cancel'];
  return daftar.includes(status) ? status : 'queued';
}

// Fungsi ini membantu ambil job terbaru duluan.
function urutkanJobTerbaruDulu(a: JobSchedule, b: JobSchedule): number {
  return b.dibuatPadaMs - a.dibuatPadaMs;
}

type HandlerAsync = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => Promise<void>;

function bungkusAsync(handler: HandlerAsync): express.RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

function durasiLebihDariNol(d: DurasiKecil): boolean {
  return ubahDurasiKeMs(d.jam, d.menit, d.detik) > 0;
}

function normalisasiNamaUser(raw: string): string {
  return String(raw || '').trim();
}

function normalisasiNamaUserLower(raw: string): string {
  return normalisasiNamaUser(raw).toLowerCase();
}

function buatIdUserUnik(nameLower: string, daftar: AkunUser[]): string {
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

function ambilSessionWajib(req: express.Request, res: express.Response): {
  userId: string;
  username: string;
} | null {
  const sessionUser = ambilUserSession(req);
  if (sessionUser) return sessionUser;

  res.status(401).json({ ok: false, pesan: 'Belum login.' });
  return null;
}

function normalisasiDurasi(d: DurasiKecil): DurasiKecil {
  return {
    jam: Math.max(0, Math.floor(Number(d.jam || 0))),
    menit: Math.max(0, Math.floor(Number(d.menit || 0))),
    detik: Math.max(0, Math.floor(Number(d.detik || 0))),
  };
}

async function pastikanFileMediaAda(media: InfoMedia): Promise<boolean> {
  const pathAbsolut = path.join(process.cwd(), media.pathRelatif);
  try {
    await fs.access(pathAbsolut);
    return true;
  } catch {
    return false;
  }
}

export type InputAudienceBuatJob = z.infer<typeof skemaAudience>;

export function normalisasiAudienceBuatJob(input: InputAudienceBuatJob): {
  ok: true;
  audience: InfoAudience;
} | {
  ok: false;
  pesan: string;
} {
  const tipeAudience = input.tipe as TipeAudience;

  if (tipeAudience === 'developer_command') {
    const command = normalisasiDeveloperCommand(input.command || '');
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
  const daftarNomorRapi = pecahDaftarNomor(daftarNomor.join('\n'));

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

function normalisasiBlokSendMessage(
  input: InputBlokSendMessageBuatJob[],
): { ok: true; blok: BlokSendMessage[] } | { ok: false; pesan: string } {
  const hasil: BlokSendMessage[] = [];

  for (const item of input) {
    const id = String(item.id || nanoid(8)).trim();
    if (!id) return { ok: false, pesan: 'ID block tidak valid.' };

    if (item.jenis === 'delay') {
      const durasi = normalisasiDurasi(item.durasi);
      if (!durasiLebihDariNol(durasi)) {
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

export function normalisasiSendMessageBuatJob(input: InputSendMessageBuatJob): {
  ok: true;
  sendMessage: InfoSendMessage;
} | {
  ok: false;
  pesan: string;
} {
  const nomorTujuan = rapikanNomor(input.nomorTujuan);
  if (!nomorTujuan) {
    return { ok: false, pesan: 'Nomor tujuan tidak valid.' };
  }

  const pesanAwal = String(input.pesanAwal || '').trim();
  if (!pesanAwal) {
    return { ok: false, pesan: 'Pesan awal wajib diisi.' };
  }

  const normalisasiBlok = normalisasiBlokSendMessage(input.blok || []);
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

// ===== AUTH =====

// POST /api/login
router.post('/login', express.json(), bungkusAsync(async (req, res) => {
  const parse = skemaLogin.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ ok: false, pesan: 'Format login tidak valid.' });
    return;
  }

  const { username, password } = parse.data;
  const user = await autentikasiUser(username, password);
  if (!user) {
    res.status(401).json({ ok: false, pesan: 'Username/password salah.' });
    return;
  }

  await tandaiLogin(req, { id: user.id, name: user.name });
  const nextRoute = await tentukanRuteSetelahLogin(user.id);
  res.json({ ok: true, nextRoute });
}));

// POST /api/register
router.post('/register', express.json(), bungkusAsync(async (req, res) => {
  const parse = skemaRegister.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ ok: false, pesan: 'Format register tidak valid.' });
    return;
  }

  const name = normalisasiNamaUser(parse.data.name);
  const nameLower = normalisasiNamaUserLower(name);
  const password = String(parse.data.password || '');
  const encryptor = String(parse.data.encryptor || '').trim() || nanoid(24);
  const developerAccess = String(parse.data.developerAccess || '').trim();

  if (!nameLower || name.length < 3) {
    res.status(400).json({ ok: false, pesan: 'Nama user minimal 3 karakter.' });
    return;
  }

  if (developerAccess !== ambilAccessCodeRegister()) {
    res.status(401).json({ ok: false, pesan: 'Developer access salah.' });
    return;
  }

  let userBaruId = '';
  let userBaruName = '';
  await ubahDatabase(async (db) => {
    const sudahAda = db.users.some((user) => user.nameLower === nameLower);
    if (sudahAda) {
      throw new Error('Nama user sudah dipakai.');
    }

    const id = buatIdUserUnik(nameLower, db.users);
    const passwordHash = await hashPassword(password);

    const userBaru: AkunUser = {
      id,
      name,
      nameLower,
      passwordHash,
      encryptor,
      createdAtMs: sekarangMs(),
      source: 'register',
    };

    db.users.push(userBaru);
    userBaruId = userBaru.id;
    userBaruName = userBaru.name;
    if (!db.waByUser[id]) {
      db.waByUser[id] = {
        status: 'mati',
        qr: null,
        terakhirUpdateMs: sekarangMs(),
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

  await tandaiLogin(req, { id: userBaruId, name: userBaruName });
  await tambahLog(
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

// GET /api/session
router.get('/session', butuhLogin, bungkusAsync(async (req, res) => {
  const sessionUser = ambilSessionWajib(req, res);
  if (!sessionUser) return;

  const nextRoute = await tentukanRuteSetelahLogin(sessionUser.userId);
  res.json({
    ok: true,
    session: sessionUser,
    nextRoute,
  });
}));

// POST /api/logout
router.post('/logout', bungkusAsync(async (req, res) => {
  await tandaiLogout(req);
  req.session.destroy(() => {
    res.json({ ok: true });
  });
}));

// ===== WHATSAPP STATUS =====

// GET /api/wa/status
router.get('/wa/status', butuhLogin, bungkusAsync(async (req, res) => {
  const sessionUser = ambilSessionWajib(req, res);
  if (!sessionUser) return;

  const db = await bacaDatabase();
  const wa = db.waByUser[sessionUser.userId] || {
    status: 'mati',
    qr: null,
    nomor: null,
    catatan: null,
    terakhirUpdateMs: sekarangMs(),
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
      qr: null, // jangan kirim string QR mentah ke client
      qrDataUrl,
    },
  });
}));

// ===== UPLOAD =====

// POST /api/upload
router.post('/upload', butuhLogin, uploader.single('media'), bungkusAsync(async (req, res) => {
  const sessionUser = ambilSessionWajib(req, res);
  if (!sessionUser) return;

  const file = req.file;
  if (!file) {
    res.status(400).json({ ok: false, pesan: 'Tidak ada file.' });
    return;
  }

  const mimeType = rapikanMimeType(file.originalname, file.mimetype);
  const tipe = tebakTipeMedia(mimeType);

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

  await tambahLog('upload_media', { media }, sessionUser.userId);

  res.json({ ok: true, media });
}));

// ===== JOBS =====

// GET /api/jobs
router.get('/jobs', butuhLogin, bungkusAsync(async (req, res) => {
  const sessionUser = ambilSessionWajib(req, res);
  if (!sessionUser) return;

  const db = await bacaDatabase();
  const daftar = [...db.job]
    .filter((job) => job.userId === sessionUser.userId)
    .sort(urutkanJobTerbaruDulu);
  res.json({ ok: true, job: daftar });
}));

// GET /api/log
router.get('/log', butuhLogin, bungkusAsync(async (req, res) => {
  const sessionUser = ambilSessionWajib(req, res);
  if (!sessionUser) return;

  const db = await bacaDatabase();
  const daftarLog = db.log.filter((baris) => !baris.userId || baris.userId === sessionUser.userId);
  res.json({ ok: true, log: daftarLog });
}));

// POST /api/jobs (buat job baru)
router.post('/jobs', butuhLogin, express.json(), bungkusAsync(async (req, res) => {
  const sessionUser = ambilSessionWajib(req, res);
  if (!sessionUser) return;

  const parse = skemaBuatJobGabungan.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ ok: false, pesan: 'Data job tidak valid.' });
    return;
  }

  const durasiMs = ubahDurasiKeMs(parse.data.durasi.jam, parse.data.durasi.menit, parse.data.durasi.detik);
  if (durasiMs <= 0) {
    res.status(400).json({ ok: false, pesan: 'Durasi harus lebih dari 0.' });
    return;
  }

  const now = sekarangMs();
  const targetMs = now + durasiMs;
  const jendela = buatJendelaPengiriman(targetMs);

  if (parse.data.jenis === 'send_message') {
    const normalisasiSendMessage = normalisasiSendMessageBuatJob(parse.data.sendMessage);
    if (!normalisasiSendMessage.ok) {
      res.status(400).json({ ok: false, pesan: normalisasiSendMessage.pesan });
      return;
    }

    const mediaOpsional = normalisasiSendMessage.sendMessage.media;
    if (mediaOpsional) {
      const fileAda = await pastikanFileMediaAda(mediaOpsional);
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
      status: rapikanStatusJob('queued'),
      sendMessage: normalisasiSendMessage.sendMessage,
      attemptCount: 0,
      terakhirAttemptMs: undefined,
      berikutnyaCobaMs: undefined,
      terakhirError: undefined,
      selesaiMs: undefined,
    };

    await ubahDatabase((db: StrukturDatabase) => {
      db.job.push(job);
    });

    await tambahLog('buat_job', {
      id: job.id,
      jenis: 'send_message',
      targetMs: job.targetMs,
      sendMessage: job.sendMessage,
    }, sessionUser.userId);

    res.json({ ok: true, job });
    return;
  }

  const normalisasiAudience = normalisasiAudienceBuatJob(parse.data.audience);
  if (!normalisasiAudience.ok) {
    res.status(400).json({ ok: false, pesan: normalisasiAudience.pesan });
    return;
  }

  const fileAda = await pastikanFileMediaAda(parse.data.media);
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
    status: rapikanStatusJob('queued'),
    media: parse.data.media,
    caption: (parse.data.caption || '').trim(),
    audience: normalisasiAudience.audience,
    attemptCount: 0,
    terakhirAttemptMs: undefined,
    berikutnyaCobaMs: undefined,
    terakhirError: undefined,
    selesaiMs: undefined,
  };

  await ubahDatabase((db: StrukturDatabase) => {
    db.job.push(job);
  });

  await tambahLog('buat_job', {
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

// POST /api/jobs/:id/cancel
router.post('/jobs/:id/cancel', butuhLogin, bungkusAsync(async (req, res) => {
  const sessionUser = ambilSessionWajib(req, res);
  if (!sessionUser) return;

  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ ok: false, pesan: 'ID job kosong.' });
    return;
  }

  let ketemu: JobSchedule | null = null;

  await ubahDatabase((db) => {
    const job = db.job.find((j) => j.id === id && j.userId === sessionUser.userId);
    if (!job) return;

    if (job.status === 'success') return;
    job.status = 'cancel';
    job.selesaiMs = sekarangMs();
    ketemu = job;
  });

  if (!ketemu) {
    res.status(404).json({ ok: false, pesan: 'Job tidak ditemukan.' });
    return;
  }

  await tambahLog('cancel_job', { id }, sessionUser.userId);

  res.json({ ok: true, job: ketemu });
}));

// POST /api/jobs/clear-completed
router.post('/jobs/clear-completed', butuhLogin, bungkusAsync(async (req, res) => {
  const sessionUser = ambilSessionWajib(req, res);
  if (!sessionUser) return;

  let jumlahDihapus = 0;

  await ubahDatabase((db) => {
    const sebelum = db.job.filter((job) => job.userId === sessionUser.userId).length;
    db.job = db.job.filter((job) => {
      if (job.userId !== sessionUser.userId) return true;
      return job.status !== 'success' && job.status !== 'cancel';
    });
    const sesudah = db.job.filter((job) => job.userId === sessionUser.userId).length;
    jumlahDihapus = sebelum - sesudah;
  });

  if (jumlahDihapus > 0) {
    await tambahLog('hapus_job_selesai', { jumlahDihapus }, sessionUser.userId);
  }

  res.json({ ok: true, jumlahDihapus });
}));

export function buatRouterApi(): express.Router {
  // Fungsi ini mengembalikan router siap pakai untuk server Express.
  return router;
}

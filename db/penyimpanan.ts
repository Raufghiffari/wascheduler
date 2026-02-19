// db/penyimpanan.ts
// Modul penyimpanan berbasis file JSON.
// Karena server & worker jalan bareng, akses file di-lock pakai proper-lockfile.

import fs from 'fs/promises';
import path from 'path';
import lockfile from 'proper-lockfile';
import { nanoid } from 'nanoid';
import type { AkunUser, LogBaris, StatusWaDiDb, StrukturDatabase } from '../shared/tipe';
import { hashPassword, verifikasiPassword } from '../shared/password';
import { sekarangMs } from '../shared/util-waktu';

type StrukturDatabaseV1 = {
  versi: 1;
  wa?: StatusWaDiDb;
  job?: Array<Record<string, unknown>>;
  log?: Array<Record<string, unknown>>;
};

const lokasiFolderDb = path.join(process.cwd(), 'db');
const lokasiBerkasDb = path.join(lokasiFolderDb, 'data.json');
const opsiLockDatabase = {
  stale: 15_000,
  update: 5_000,
  retries: {
    retries: 40,
    minTimeout: 50,
    maxTimeout: 500,
  },
  realpath: false,
};

export class DbBusyError extends Error {
  readonly code = 'DB_BUSY';
  readonly penyebabAsli: unknown;

  constructor(pesan: string, penyebabAsli?: unknown) {
    super(pesan);
    this.name = 'DbBusyError';
    this.penyebabAsli = penyebabAsli;
  }
}

function normalisasiError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

function ambilUsernameEnv(): string {
  const kandidat = String(process.env.DASH_USER || 'admin').trim();
  return kandidat || 'admin';
}

function ambilPasswordEnv(): string {
  const kandidat = String(process.env.DASH_PASS || 'admin123');
  return kandidat || 'admin123';
}

function ambilNameLower(nama: string): string {
  return String(nama || '').trim().toLowerCase();
}

function idDasarUserDariNama(nama: string): string {
  const slug = ambilNameLower(nama).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'admin';
  return `user_${slug}`;
}

function idUserUnik(dasar: string, daftarTerpakai: Set<string>): string {
  let id = dasar;
  let i = 2;
  while (daftarTerpakai.has(id)) {
    id = `${dasar}_${i}`;
    i += 1;
  }
  return id;
}

export function buatStatusWaAwal(now: number = sekarangMs()): StatusWaDiDb {
  return {
    status: 'mati',
    qr: null,
    terakhirUpdateMs: now,
    nomor: null,
    catatan: null,
  };
}

export function petakanErrorLockDatabase(err: unknown): Error {
  const e = normalisasiError(err);
  const kode = String((e as { code?: unknown }).code || '');
  const pesan = String(e.message || '').toLowerCase();

  const terkunci = kode === 'ELOCKED' || pesan.includes('lock file is already being held');
  const compromised = kode === 'ECOMPROMISED' || pesan.includes('compromised');

  if (terkunci) {
    return new DbBusyError('Database sedang dipakai proses lain, coba lagi sebentar.', e);
  }

  if (compromised) {
    return new DbBusyError('Lock database bermasalah, coba lagi sebentar.', e);
  }

  return e;
}

export function adalahDbBusyError(err: unknown): err is DbBusyError {
  return err instanceof DbBusyError;
}

async function ambilLockDatabase(): Promise<() => Promise<void>> {
  let compromisedError: unknown = null;

  try {
    const release = await lockfile.lock(lokasiBerkasDb, {
      ...opsiLockDatabase,
      onCompromised: (err: unknown) => {
        compromisedError = err;
      },
    });

    return async () => {
      try {
        await release();
      } catch (err) {
        throw petakanErrorLockDatabase(err);
      }

      if (compromisedError) {
        throw petakanErrorLockDatabase(compromisedError);
      }
    };
  } catch (err) {
    throw petakanErrorLockDatabase(err);
  }
}

function bacaJsonAman(isi: string): unknown {
  try {
    return JSON.parse(isi) as unknown;
  } catch {
    return {};
  }
}

function ambilAkunUserValid(raw: unknown): AkunUser[] {
  if (!Array.isArray(raw)) return [];
  const hasil: AkunUser[] = [];
  const lowerTerpakai = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;

    const id = String(row.id || '').trim();
    const name = String(row.name || '').trim();
    const passwordHash = String(row.passwordHash || '').trim();
    const nameLower = ambilNameLower(String(row.nameLower || name));
    const encryptor = String(row.encryptor || '').trim() || nanoid(24);
    const createdAtMs = Number(row.createdAtMs || 0) || sekarangMs();
    const source = row.source === 'register' ? 'register' : 'env';

    if (!id || !name || !nameLower || !passwordHash) continue;
    if (lowerTerpakai.has(nameLower)) continue;
    lowerTerpakai.add(nameLower);

    hasil.push({
      id,
      name,
      nameLower,
      passwordHash,
      encryptor,
      createdAtMs,
      source,
    });
  }

  return hasil;
}

function normalisasiStatusWa(raw: unknown): StatusWaDiDb {
  if (!raw || typeof raw !== 'object') return buatStatusWaAwal();
  const row = raw as Record<string, unknown>;
  const status = row.status === 'terhubung'
    || row.status === 'menghubungkan'
    || row.status === 'logout'
    || row.status === 'mati'
    ? row.status
    : 'mati';
  return {
    status,
    qr: typeof row.qr === 'string' ? row.qr : null,
    terakhirUpdateMs: Number(row.terakhirUpdateMs || 0) || sekarangMs(),
    nomor: typeof row.nomor === 'string' ? row.nomor : null,
    catatan: typeof row.catatan === 'string' ? row.catatan : null,
  };
}

function normalisasiWaByUser(raw: unknown): Record<string, StatusWaDiDb> {
  if (!raw || typeof raw !== 'object') return {};
  const sumber = raw as Record<string, unknown>;
  const hasil: Record<string, StatusWaDiDb> = {};

  for (const [userId, value] of Object.entries(sumber)) {
    const id = String(userId || '').trim();
    if (!id) continue;
    hasil[id] = normalisasiStatusWa(value);
  }

  return hasil;
}

function normalisasiLog(raw: unknown): LogBaris[] {
  if (!Array.isArray(raw)) return [];
  const hasil: LogBaris[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id || '').trim() || nanoid();
    const waktuMs = Number(row.waktuMs || 0) || sekarangMs();
    const jenis = String(row.jenis || '').trim();
    if (!jenis) continue;
    const detailObj = row.detail && typeof row.detail === 'object' ? row.detail as Record<string, unknown> : {};
    const userIdRaw = String(row.userId || '').trim();
    hasil.push({
      id,
      waktuMs,
      jenis: jenis as LogBaris['jenis'],
      detail: detailObj,
      userId: userIdRaw || undefined,
    });
  }
  return hasil;
}

function normalisasiJob(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({ ...(item as Record<string, unknown>) }));
}

async function sinkronkanUserEnv(db: StrukturDatabase): Promise<{ envUserId: string; berubah: boolean }> {
  const username = ambilUsernameEnv();
  const password = ambilPasswordEnv();
  const nameLower = ambilNameLower(username);
  const daftarId = new Set(db.users.map((u) => u.id));

  let user = db.users.find((u) => u.nameLower === nameLower);
  let berubah = false;

  if (!user) {
    const id = idUserUnik(idDasarUserDariNama(username), daftarId);
    const passwordHash = await hashPassword(password);
    user = {
      id,
      name: username,
      nameLower,
      passwordHash,
      encryptor: nanoid(24),
      createdAtMs: sekarangMs(),
      source: 'env',
    };
    db.users.unshift(user);
    berubah = true;
  } else {
    if (user.name !== username) {
      user.name = username;
      berubah = true;
    }
    if (user.source !== 'env') {
      user.source = 'env';
      berubah = true;
    }

    const cocok = await verifikasiPassword(password, user.passwordHash);
    if (!cocok) {
      user.passwordHash = await hashPassword(password);
      berubah = true;
    }
  }

  if (!db.waByUser[user.id]) {
    db.waByUser[user.id] = buatStatusWaAwal();
    berubah = true;
  }

  return { envUserId: user.id, berubah };
}

function buatDatabaseKosongV2(): StrukturDatabase {
  return {
    versi: 2,
    users: [],
    waByUser: {},
    job: [],
    log: [],
  };
}

async function normalisasiDatabase(raw: unknown): Promise<{ db: StrukturDatabase; berubah: boolean }> {
  let db = buatDatabaseKosongV2();
  let berubah = false;
  let dariV1 = false;
  let waLegacy: StatusWaDiDb | null = null;

  if (raw && typeof raw === 'object') {
    const row = raw as Record<string, unknown>;
    if (Number(row.versi) === 2) {
      db = {
        versi: 2,
        users: ambilAkunUserValid(row.users),
        waByUser: normalisasiWaByUser(row.waByUser),
        job: normalisasiJob(row.job) as any,
        log: normalisasiLog(row.log),
      };
    } else if (Number(row.versi) === 1) {
      const lama = row as unknown as StrukturDatabaseV1;
      dariV1 = true;
      db = {
        versi: 2,
        users: [],
        waByUser: {},
        job: normalisasiJob(lama.job) as any,
        log: normalisasiLog(lama.log),
      };
      waLegacy = normalisasiStatusWa(lama.wa);
      berubah = true;
    } else {
      berubah = true;
    }
  } else {
    berubah = true;
  }

  const envSync = await sinkronkanUserEnv(db);
  if (envSync.berubah) berubah = true;

  const envUserId = envSync.envUserId;
  if (dariV1) {
    db.waByUser[envUserId] = waLegacy || buatStatusWaAwal();
  }

  const userIds = new Set(db.users.map((u) => u.id));
  for (const userId of userIds) {
    if (!db.waByUser[userId]) {
      db.waByUser[userId] = buatStatusWaAwal();
      berubah = true;
    }
  }

  db.job = db.job.map((job) => {
    const next = { ...job };
    const uid = String(next.userId || '').trim();
    if (!uid || !userIds.has(uid)) {
      next.userId = envUserId;
      berubah = true;
    }
    return next;
  }) as any;

  db.log = db.log.map((log) => {
    const next = { ...log };
    if (dariV1 && !next.userId) {
      next.userId = envUserId;
      berubah = true;
    }
    return next;
  });

  return { db, berubah };
}

export async function normalisasiDatabaseUntukTest(raw: unknown): Promise<StrukturDatabase> {
  const hasil = await normalisasiDatabase(raw);
  return hasil.db;
}

async function tulisDatabaseKeDisk(db: StrukturDatabase): Promise<void> {
  const tmp = lokasiBerkasDb + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), { encoding: 'utf-8' });
  await fs.rename(tmp, lokasiBerkasDb);
}

// Fungsi ini memastikan folder `db/` dan file `db/data.json` ada.
export async function pastikanDatabaseAda(): Promise<void> {
  await fs.mkdir(lokasiFolderDb, { recursive: true });

  try {
    await fs.access(lokasiBerkasDb);
  } catch {
    const awal = buatDatabaseKosongV2();
    await fs.writeFile(lokasiBerkasDb, JSON.stringify(awal, null, 2), { encoding: 'utf-8' });
  }
}

// Fungsi ini membaca database JSON dengan aman (terkunci).
export async function bacaDatabase(): Promise<StrukturDatabase> {
  await pastikanDatabaseAda();

  const rilis = await ambilLockDatabase();

  try {
    const isi = await fs.readFile(lokasiBerkasDb, { encoding: 'utf-8' });
    const raw = bacaJsonAman(isi);
    const normal = await normalisasiDatabase(raw);

    if (normal.berubah) {
      await tulisDatabaseKeDisk(normal.db);
    }

    return normal.db;
  } finally {
    await rilis();
  }
}

// Fungsi ini mengubah database (read-modify-write) dengan aman (terkunci).
export async function ubahDatabase(
  ubah: (db: StrukturDatabase) => void | Promise<void>,
): Promise<StrukturDatabase> {
  await pastikanDatabaseAda();

  const rilis = await ambilLockDatabase();

  try {
    const isi = await fs.readFile(lokasiBerkasDb, { encoding: 'utf-8' });
    const raw = bacaJsonAman(isi);
    const normal = await normalisasiDatabase(raw);
    const db = normal.db;

    await ubah(db);

    await tulisDatabaseKeDisk(db);
    return db;
  } finally {
    await rilis();
  }
}

// Fungsi ini menambahkan log baris ke database.
export async function tambahLog(
  jenis: LogBaris['jenis'],
  detail: LogBaris['detail'],
  userId?: string,
): Promise<void> {
  const baris: LogBaris = {
    id: nanoid(),
    waktuMs: sekarangMs(),
    userId: userId || undefined,
    jenis,
    detail,
  };

  await ubahDatabase((db) => {
    db.log.unshift(baris);
    // Biar file nggak membesar tanpa batas.
    if (db.log.length > 1000) db.log.length = 1000;
  });
}

// Fungsi ini mengambil path absolut dari path relatif media (yang disimpan di DB).
export function ubahPathRelatifKeAbsolut(pathRelatif: string): string {
  return path.join(process.cwd(), pathRelatif);
}

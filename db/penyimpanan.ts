
import fs from 'fs/promises';
import path from 'path';
import lockfile from 'proper-lockfile';
import { nanoid } from 'nanoid';
import type { AkunUser, LogBaris, StatusWaDiDb, StrukturDatabase } from '../shared/tipe';
import { hshpsswrd, vrfkspsswrd } from '../shared/password';
import { skrngms } from '../shared/util-waktu';

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

function nrmlsserrr(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

function amblusrnmenv(): string {
  const kandidat = String(process.env.DASH_USER || 'admin').trim();
  return kandidat || 'admin';
}

function amblpsswrdenv(): string {
  const kandidat = String(process.env.DASH_PASS || 'admin123');
  return kandidat || 'admin123';
}

function amblnamelwr(nama: string): string {
  return String(nama || '').trim().toLowerCase();
}

function iddsrusrdarinama(nama: string): string {
  const slug = amblnamelwr(nama).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'admin';
  return `user_${slug}`;
}

function idusrunk(dasar: string, daftarTerpakai: Set<string>): string {
  let id = dasar;
  let i = 2;
  while (daftarTerpakai.has(id)) {
    id = `${dasar}_${i}`;
    i += 1;
  }
  return id;
}

export function buatsttswaawl(now: number = skrngms()): StatusWaDiDb {
  return {
    status: 'mati',
    qr: null,
    terakhirUpdateMs: now,
    nomor: null,
    catatan: null,
  };
}

export function ptknerrrlckdtbs(err: unknown): Error {
  const e = nrmlsserrr(err);
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

export function adlhdbbsyerrr(err: unknown): err is DbBusyError {
  return err instanceof DbBusyError;
}

async function ambllckdtbs(): Promise<() => Promise<void>> {
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
        throw ptknerrrlckdtbs(err);
      }

      if (compromisedError) {
        throw ptknerrrlckdtbs(compromisedError);
      }
    };
  } catch (err) {
    throw ptknerrrlckdtbs(err);
  }
}

function bacajsnamn(isi: string): unknown {
  try {
    return JSON.parse(isi) as unknown;
  } catch {
    return {};
  }
}

function amblaknusrvld(raw: unknown): AkunUser[] {
  if (!Array.isArray(raw)) return [];
  const hasil: AkunUser[] = [];
  const lowerTerpakai = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;

    const id = String(row.id || '').trim();
    const name = String(row.name || '').trim();
    const passwordHash = String(row.passwordHash || '').trim();
    const nameLower = amblnamelwr(String(row.nameLower || name));
    const encryptor = String(row.encryptor || '').trim() || nanoid(24);
    const createdAtMs = Number(row.createdAtMs || 0) || skrngms();
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

function nrmlsssttswa(raw: unknown): StatusWaDiDb {
  if (!raw || typeof raw !== 'object') return buatsttswaawl();
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
    terakhirUpdateMs: Number(row.terakhirUpdateMs || 0) || skrngms(),
    nomor: typeof row.nomor === 'string' ? row.nomor : null,
    catatan: typeof row.catatan === 'string' ? row.catatan : null,
  };
}

function nrmlsswabyusr(raw: unknown): Record<string, StatusWaDiDb> {
  if (!raw || typeof raw !== 'object') return {};
  const sumber = raw as Record<string, unknown>;
  const hasil: Record<string, StatusWaDiDb> = {};

  for (const [userId, value] of Object.entries(sumber)) {
    const id = String(userId || '').trim();
    if (!id) continue;
    hasil[id] = nrmlsssttswa(value);
  }

  return hasil;
}

function nrmlsslog(raw: unknown): LogBaris[] {
  if (!Array.isArray(raw)) return [];
  const hasil: LogBaris[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id || '').trim() || nanoid();
    const waktuMs = Number(row.waktuMs || 0) || skrngms();
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

function nrmlssjob(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({ ...(item as Record<string, unknown>) }));
}

async function snkrnknusrenv(db: StrukturDatabase): Promise<{ envUserId: string; berubah: boolean }> {
  const username = amblusrnmenv();
  const password = amblpsswrdenv();
  const nameLower = amblnamelwr(username);
  const daftarId = new Set(db.users.map((u) => u.id));

  let user = db.users.find((u) => u.nameLower === nameLower);
  let berubah = false;

  if (!user) {
    const id = idusrunk(iddsrusrdarinama(username), daftarId);
    const passwordHash = await hshpsswrd(password);
    user = {
      id,
      name: username,
      nameLower,
      passwordHash,
      encryptor: nanoid(24),
      createdAtMs: skrngms(),
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

    const cocok = await vrfkspsswrd(password, user.passwordHash);
    if (!cocok) {
      user.passwordHash = await hshpsswrd(password);
      berubah = true;
    }
  }

  if (!db.waByUser[user.id]) {
    db.waByUser[user.id] = buatsttswaawl();
    berubah = true;
  }

  return { envUserId: user.id, berubah };
}

function buatdtbsksngv2(): StrukturDatabase {
  return {
    versi: 2,
    users: [],
    waByUser: {},
    job: [],
    log: [],
  };
}

async function nrmlssdtbs(raw: unknown): Promise<{ db: StrukturDatabase; berubah: boolean }> {
  let db = buatdtbsksngv2();
  let berubah = false;
  let dariV1 = false;
  let waLegacy: StatusWaDiDb | null = null;

  if (raw && typeof raw === 'object') {
    const row = raw as Record<string, unknown>;
    if (Number(row.versi) === 2) {
      db = {
        versi: 2,
        users: amblaknusrvld(row.users),
        waByUser: nrmlsswabyusr(row.waByUser),
        job: nrmlssjob(row.job) as any,
        log: nrmlsslog(row.log),
      };
    } else if (Number(row.versi) === 1) {
      const lama = row as unknown as StrukturDatabaseV1;
      dariV1 = true;
      db = {
        versi: 2,
        users: [],
        waByUser: {},
        job: nrmlssjob(lama.job) as any,
        log: nrmlsslog(lama.log),
      };
      waLegacy = nrmlsssttswa(lama.wa);
      berubah = true;
    } else {
      berubah = true;
    }
  } else {
    berubah = true;
  }

  const envSync = await snkrnknusrenv(db);
  if (envSync.berubah) berubah = true;

  const envUserId = envSync.envUserId;
  if (dariV1) {
    db.waByUser[envUserId] = waLegacy || buatsttswaawl();
  }

  const userIds = new Set(db.users.map((u) => u.id));
  for (const userId of userIds) {
    if (!db.waByUser[userId]) {
      db.waByUser[userId] = buatsttswaawl();
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

export async function nrmlssdtbsuntktst(raw: unknown): Promise<StrukturDatabase> {
  const hasil = await nrmlssdtbs(raw);
  return hasil.db;
}

async function tlsdtbskedsk(db: StrukturDatabase): Promise<void> {
  const tmp = lokasiBerkasDb + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), { encoding: 'utf-8' });
  await fs.rename(tmp, lokasiBerkasDb);
}

export async function pstkndtbsada(): Promise<void> {
  await fs.mkdir(lokasiFolderDb, { recursive: true });

  try {
    await fs.access(lokasiBerkasDb);
  } catch {
    const awal = buatdtbsksngv2();
    await fs.writeFile(lokasiBerkasDb, JSON.stringify(awal, null, 2), { encoding: 'utf-8' });
  }
}

export async function bacadtbs(): Promise<StrukturDatabase> {
  await pstkndtbsada();

  const rilis = await ambllckdtbs();

  try {
    const isi = await fs.readFile(lokasiBerkasDb, { encoding: 'utf-8' });
    const raw = bacajsnamn(isi);
    const normal = await nrmlssdtbs(raw);

    if (normal.berubah) {
      await tlsdtbskedsk(normal.db);
    }

    return normal.db;
  } finally {
    await rilis();
  }
}

export async function ubhdtbs(
  ubah: (db: StrukturDatabase) => void | Promise<void>,
): Promise<StrukturDatabase> {
  await pstkndtbsada();

  const rilis = await ambllckdtbs();

  try {
    const isi = await fs.readFile(lokasiBerkasDb, { encoding: 'utf-8' });
    const raw = bacajsnamn(isi);
    const normal = await nrmlssdtbs(raw);
    const db = normal.db;

    await ubah(db);

    await tlsdtbskedsk(db);
    return db;
  } finally {
    await rilis();
  }
}

export async function tmbhlog(
  jenis: LogBaris['jenis'],
  detail: LogBaris['detail'],
  userId?: string,
): Promise<void> {
  const baris: LogBaris = {
    id: nanoid(),
    waktuMs: skrngms(),
    userId: userId || undefined,
    jenis,
    detail,
  };

  await ubhdtbs((db) => {
    db.log.unshift(baris);
    if (db.log.length > 1000) db.log.length = 1000;
  });
}

export function ubhpthrltfkeabslt(pathRelatif: string): string {
  return path.join(process.cwd(), pathRelatif);
}

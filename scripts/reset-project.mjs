import { readdir, rm } from 'fs/promises';
import path from 'path';
import process from 'process';

const akar = process.cwd();
const targetDirektori = ['dist', 'media', 'wa_auth', path.join('db', 'wa-store')];
const targetAsetDir = path.join(akar, 'public', 'assets');
const targetDbDir = path.join(akar, 'db');
const namaFileRuntimeDb = new Set([
  'data.json',
  'wa-store.json',
  'server.instance',
  'worker.instance',
]);

function amblpsnerrr(err) {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function hpsrltf(relatif) {
  const abs = path.join(akar, relatif);
  await rm(abs, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
}

async function hpsbndlui() {
  let daftar = [];
  try {
    daftar = await readdir(targetAsetDir, { withFileTypes: true });
  } catch (err) {
    const kode = String((err && typeof err === 'object' && 'code' in err) ? err.code : '');
    if (kode === 'ENOENT') return;
    throw err;
  }

  await Promise.all(
    daftar
      .filter((item) => item.isFile() && (item.name.endsWith('.js') || item.name.endsWith('.js.map')))
      .map((item) => rm(path.join(targetAsetDir, item.name), { force: true })),
  );
}

async function hpsrntmdb() {
  let daftar = [];
  try {
    daftar = await readdir(targetDbDir, { withFileTypes: true });
  } catch (err) {
    const kode = String((err && typeof err === 'object' && 'code' in err) ? err.code : '');
    if (kode === 'ENOENT') return;
    throw err;
  }

  await Promise.all(
    daftar
      .filter((item) => {
        if (!item.isFile()) return false;
        if (namaFileRuntimeDb.has(item.name)) return true;
        if (item.name.endsWith('.lock')) return true;
        if (item.name.endsWith('.tmp')) return true;
        return false;
      })
      .map((item) => rm(path.join(targetDbDir, item.name), { force: true })),
  );
}

async function mnx() {
  console.log('[reset] membersihkan runtime/build artifacts...');
  const gagal = [];

  for (const rel of targetDirektori) {
    try {
      await hpsrltf(rel);
      console.log(`[reset] removed ${rel}`);
    } catch (err) {
      const pesan = amblpsnerrr(err);
      gagal.push(`${rel}: ${pesan}`);
      console.warn(`[reset] gagal hapus ${rel}: ${pesan}`);
    }
  }

  try {
    await hpsrntmdb();
    console.log('[reset] removed db runtime files');
  } catch (err) {
    const pesan = amblpsnerrr(err);
    gagal.push(`db runtime files: ${pesan}`);
    console.warn(`[reset] gagal hapus db runtime files: ${pesan}`);
  }

  try {
    await hpsbndlui();
    console.log('[reset] removed public/assets/*.js');
  } catch (err) {
    const pesan = amblpsnerrr(err);
    gagal.push(`public/assets/*.js: ${pesan}`);
    console.warn(`[reset] gagal hapus public/assets/*.js: ${pesan}`);
  }

  if (gagal.length) {
    console.error('[reset] selesai dengan error. Pastikan server/worker sudah berhenti, lalu jalankan lagi.');
    for (const item of gagal) console.error(`[reset] - ${item}`);
    process.exit(1);
  }

  console.log('[reset] selesai. Jalankan "npm run build" sebelum start lagi.');
}

mnx().catch((err) => {
  console.error('[reset] gagal:', err);
  process.exit(1);
});

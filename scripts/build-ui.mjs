import { build } from 'esbuild';
import { readdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import process from 'process';

const akar = process.cwd();
const dirAset = path.join(akar, 'public', 'assets');

async function hpsastjslama() {
  const daftar = await readdir(dirAset);
  await Promise.all(
    daftar
      .filter((nama) => nama.endsWith('.js') || nama.endsWith('.js.map'))
      .map((nama) => rm(path.join(dirAset, nama), { force: true })),
  );
}

async function setscrpthtml(relHtml, namaJs) {
  const file = path.join(akar, relHtml);
  let html = await readFile(file, 'utf8');

  if (!/<link\s+rel=["']stylesheet["']\s+href=["']\/assets\/styles\.css["']\s*\/?>/i.test(html)) {
    html = html.replace(/^\s*<\/head>/im, '    <link rel="stylesheet" href="/assets/styles.css" />\n  </head>');
  }

  html = html.replace(/<script src="\/assets\/[^"]+"><\/script>/i, `<script src="/assets/${namaJs}"></script>`);
  await writeFile(file, html, 'utf8');
}

async function bngnsatu(entryRel, namaOut) {
  const entry = path.join(akar, entryRel);
  const hasil = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: false,
    minify: true,
    legalComments: 'none',
    write: false,
  });

  if (!hasil.outputFiles || hasil.outputFiles.length === 0) {
    throw new Error(`Bundle gagal: ${entryRel}`);
  }

  const out = path.join(dirAset, namaOut);
  await writeFile(out, hasil.outputFiles[0].text, 'utf8');
  return namaOut;
}

async function mulaibld() {
  await hpsastjslama();

  const target = [
    { entry: 'public/assets/login.tsx', out: 'login.js', html: 'public/login.html' },
    { entry: 'public/assets/register.tsx', out: 'register.js', html: 'public/register.html' },
    { entry: 'public/assets/authorize.tsx', out: 'authorize.js', html: 'public/authorize.html' },
    { entry: 'public/assets/dashboard.tsx', out: 'dashboard.js', html: 'public/dashboard.html' },
  ];

  const hasil = [];
  for (const item of target) {
    const namaJs = await bngnsatu(item.entry, item.out);
    await setscrpthtml(item.html, namaJs);
    hasil.push(`${item.out}`);
  }

  console.log(`[build-ui] selesai (${hasil.join(', ')})`);
}

mulaibld().catch((err) => {
  console.error('[build-ui] gagal:', err);
  process.exit(1);
});

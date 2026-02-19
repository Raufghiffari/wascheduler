// shared/developer-command.ts
// Registry dan resolver untuk audience berbasis Developer Command.

import type { DeveloperCommand } from './tipe';
import { ubahNomorKeJid } from './util-nomor';

const daftarCommand: DeveloperCommand[] = ['@private.all', '@mypreset.1', '@mypreset.2'];

const preset1: string[] = ['6283842706631', '6285641820270'];

const preset2: string[] = [
  '6282134000050',
  '6285741541508',
  '6287766633669',
  '6281329759151',
  '6289639759131',
  '6285225154077',
  '6285225594446',
  '6285700995851',
  '628988919207',
  '6283842706631',
  '6285641820270',
  '6287774003910',
  '6285292383375',
];

function normalisasiJid(jid: string): string {
  return String(jid || '').trim().toLowerCase();
}

function dedupeJid(jidList: string[]): string[] {
  const hasil: string[] = [];
  const sudah = new Set<string>();

  for (const item of jidList) {
    const key = normalisasiJid(item);
    if (!key || sudah.has(key)) continue;
    sudah.add(key);
    hasil.push(item);
  }

  return hasil;
}

function ubahPresetKeExcludeSet(daftarNomor: string[]): Set<string> {
  const set = new Set<string>();

  for (const nomor of daftarNomor) {
    const jid = ubahNomorKeJid(nomor);
    if (!jid) continue;
    set.add(normalisasiJid(jid));
  }

  return set;
}

export function daftarDeveloperCommand(): DeveloperCommand[] {
  return [...daftarCommand];
}

export function normalisasiDeveloperCommand(input: string): DeveloperCommand | null {
  const hasil = String(input || '').trim().toLowerCase();
  if (!hasil) return null;
  return (daftarCommand as string[]).includes(hasil) ? (hasil as DeveloperCommand) : null;
}

export function resolveDeveloperCommand(
  commandInput: string,
  semuaKontakJid: string[],
  selfJid: string | null,
): string[] {
  const command = normalisasiDeveloperCommand(commandInput);
  if (!command) {
    throw new Error('Developer command tidak valid.');
  }

  if (command === '@private.all') {
    if (!selfJid) {
      throw new Error('Akun WhatsApp belum siap (self JID tidak ditemukan).');
    }
    return [selfJid];
  }

  const exclude =
    command === '@mypreset.1'
      ? ubahPresetKeExcludeSet(preset1)
      : ubahPresetKeExcludeSet(preset2);

  const terlihat = semuaKontakJid.filter((jid) => !exclude.has(normalisasiJid(jid)));
  const dasar = selfJid ? [selfJid] : [];
  return dedupeJid([...dasar, ...terlihat]);
}


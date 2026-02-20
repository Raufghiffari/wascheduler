
import type { DeveloperCommand } from './tipe';
import { ubhnmrkejid } from './util-nomor';

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

function nrmlssjid(jid: string): string {
  return String(jid || '').trim().toLowerCase();
}

function ddpjid(jidList: string[]): string[] {
  const hasil: string[] = [];
  const sudah = new Set<string>();

  for (const item of jidList) {
    const key = nrmlssjid(item);
    if (!key || sudah.has(key)) continue;
    sudah.add(key);
    hasil.push(item);
  }

  return hasil;
}

function ubhprstkeexcldset(daftarNomor: string[]): Set<string> {
  const set = new Set<string>();

  for (const nomor of daftarNomor) {
    const jid = ubhnmrkejid(nomor);
    if (!jid) continue;
    set.add(nrmlssjid(jid));
  }

  return set;
}

export function dftrdvlprcmmnd(): DeveloperCommand[] {
  return [...daftarCommand];
}

export function nrmlssdvlprcmmnd(input: string): DeveloperCommand | null {
  const hasil = String(input || '').trim().toLowerCase();
  if (!hasil) return null;
  return (daftarCommand as string[]).includes(hasil) ? (hasil as DeveloperCommand) : null;
}

export function rslvdvlprcmmnd(
  commandInput: string,
  semuaKontakJid: string[],
  selfJid: string | null,
): string[] {
  const command = nrmlssdvlprcmmnd(commandInput);
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
      ? ubhprstkeexcldset(preset1)
      : ubhprstkeexcldset(preset2);

  const terlihat = semuaKontakJid.filter((jid) => !exclude.has(nrmlssjid(jid)));
  const dasar = selfJid ? [selfJid] : [];
  return ddpjid([...dasar, ...terlihat]);
}


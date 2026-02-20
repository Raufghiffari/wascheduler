
export function rpknnmr(nomorMasuk: string): string | null {
  const mentah = String(nomorMasuk ?? '').trim();
  if (!mentah) return null;

  let digit = mentah.replace(/\D/g, '');

  if (digit.startsWith('0')) {
    digit = '62' + digit.slice(1);
  }

  if (digit.length < 8) return null;

  return digit;
}

export function ubhnmrkejid(nomorMasuk: string): string | null {
  const rapi = rpknnmr(nomorMasuk);
  if (!rapi) return null;

  return `${rapi}@s.whatsapp.net`;
}

export function pchdftrnmr(teks: string): string[] {
  const sumber = String(teks ?? '');
  const potongan = sumber
    .split(/[\n,;\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const hasil: string[] = [];
  for (const p of potongan) {
    const r = rpknnmr(p);
    if (r) hasil.push(r);
  }

  return Array.from(new Set(hasil));
}

// shared/util-nomor.ts
// Utility kecil untuk merapikan nomor & membentuk JID WhatsApp.

// Fungsi ini mengubah input seperti "+62 812-xxx" jadi "62812xxx".
// Catatan: aturan ini dibuat simpel untuk single-user, bukan validasi global yang sempurna.
export function rapikanNomor(nomorMasuk: string): string | null {
  const mentah = String(nomorMasuk ?? '').trim();
  if (!mentah) return null;

  // Ambil digit saja.
  let digit = mentah.replace(/\D/g, '');

  // Konversi format Indonesia umum: 08xx -> 628xx
  if (digit.startsWith('0')) {
    digit = '62' + digit.slice(1);
  }

  // Minimal panjang, biar nggak kebanyakan sampah masuk DB.
  if (digit.length < 8) return null;

  return digit;
}

// Fungsi ini mengubah "62812xxx" menjadi JID "62812xxx@s.whatsapp.net".
export function ubahNomorKeJid(nomorMasuk: string): string | null {
  const rapi = rapikanNomor(nomorMasuk);
  if (!rapi) return null;

  return `${rapi}@s.whatsapp.net`;
}

// Fungsi ini memecah input textarea jadi list nomor (dipisah koma / spasi / newline).
export function pecahDaftarNomor(teks: string): string[] {
  const sumber = String(teks ?? '');
  const potongan = sumber
    .split(/[\n,;\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const hasil: string[] = [];
  for (const p of potongan) {
    const r = rapikanNomor(p);
    if (r) hasil.push(r);
  }

  // Hilangkan duplikat.
  return Array.from(new Set(hasil));
}

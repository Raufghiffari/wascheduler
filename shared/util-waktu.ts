// shared/util-waktu.ts
// Utility waktu sederhana untuk server/worker.

import type { JendelaKirim } from './tipe';

// Fungsi ini mengembalikan waktu sekarang dalam milidetik.
export function sekarangMs(): number {
  return Date.now();
}

// Fungsi ini mengubah input durasi jam/menit/detik menjadi milidetik.
// Nilai negatif akan dianggap 0.
export function ubahDurasiKeMs(jam: number, menit: number, detik: number): number {
  const j = Number.isFinite(jam) ? Math.max(0, Math.floor(jam)) : 0;
  const m = Number.isFinite(menit) ? Math.max(0, Math.floor(menit)) : 0;
  const d = Number.isFinite(detik) ? Math.max(0, Math.floor(detik)) : 0;

  const ms = (j * 60 * 60 + m * 60 + d) * 1000;
  return ms;
}

// Fungsi ini membuat jendela pengiriman sesuai rules:
// - window 1: 2 menit setelah target
// - jika gagal: tunggu 10 menit
// - window 2: 2 menit
export function buatJendelaPengiriman(targetMs: number): JendelaKirim {
  const duaMenit = 2 * 60 * 1000;
  const sepuluhMenit = 10 * 60 * 1000;

  const jendela1MulaiMs = targetMs;
  const jendela1AkhirMs = targetMs + duaMenit;

  const jendela2MulaiMs = jendela1AkhirMs + sepuluhMenit;
  const jendela2AkhirMs = jendela2MulaiMs + duaMenit;

  return { jendela1MulaiMs, jendela1AkhirMs, jendela2MulaiMs, jendela2AkhirMs };
}

// Fungsi ini memformat ms menjadi string jam lokal yang enak dibaca.
export function formatWaktuLokal(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString('id-ID', { hour12: false });
}

// Fungsi ini tidur (delay) dalam ms.
export async function tidur(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

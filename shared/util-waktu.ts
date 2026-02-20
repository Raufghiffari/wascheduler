
import type { JendelaKirim } from './tipe';

export function skrngms(): number {
  return Date.now();
}

export function ubhdrskems(jam: number, menit: number, detik: number): number {
  const j = Number.isFinite(jam) ? Math.max(0, Math.floor(jam)) : 0;
  const m = Number.isFinite(menit) ? Math.max(0, Math.floor(menit)) : 0;
  const d = Number.isFinite(detik) ? Math.max(0, Math.floor(detik)) : 0;

  const ms = (j * 60 * 60 + m * 60 + d) * 1000;
  return ms;
}

export function buatjndlpngrmn(targetMs: number): JendelaKirim {
  const duaMenit = 2 * 60 * 1000;
  const sepuluhMenit = 10 * 60 * 1000;

  const jendela1MulaiMs = targetMs;
  const jendela1AkhirMs = targetMs + duaMenit;

  const jendela2MulaiMs = jendela1AkhirMs + sepuluhMenit;
  const jendela2AkhirMs = jendela2MulaiMs + duaMenit;

  return { jendela1MulaiMs, jendela1AkhirMs, jendela2MulaiMs, jendela2AkhirMs };
}

export function frmtwktlkl(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString('id-ID', { hour12: false });
}

export async function tdr(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

import type { SendMessageWaitingReply } from '../shared/tipe';

export function nrmlssrplytxt(teks: string): string {
  return String(teks || '').trim().toLowerCase();
}

export function cckwaitrply(teksMasuk: string, wait: SendMessageWaitingReply): boolean {
  const rapi = nrmlssrplytxt(teksMasuk);
  if (!rapi) return false;

  if (wait.mode === 'any') return true;

  const expected = nrmlssrplytxt(wait.expectedText || '');
  if (!expected) return false;
  return rapi === expected;
}

export function htngrtrysndmssg(
  retryCountSaatIni: number,
  nowMs: number,
  intervalMs: number,
  maxPercobaan: number,
): {
  bisaLanjut: boolean;
  retryCountBaru: number;
  nextRetryAtMs?: number;
} {
  const retryCountBaru = Math.max(0, Math.floor(retryCountSaatIni)) + 1;
  if (retryCountBaru >= maxPercobaan) {
    return {
      bisaLanjut: false,
      retryCountBaru,
    };
  }

  return {
    bisaLanjut: true,
    retryCountBaru,
    nextRetryAtMs: nowMs + intervalMs,
  };
}

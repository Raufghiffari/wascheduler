import type { SendMessageWaitingReply } from '../shared/tipe';

export function normalisasiReplyText(teks: string): string {
  return String(teks || '').trim().toLowerCase();
}

export function cocokWaitReply(teksMasuk: string, wait: SendMessageWaitingReply): boolean {
  const rapi = normalisasiReplyText(teksMasuk);
  if (!rapi) return false;

  if (wait.mode === 'any') return true;

  const expected = normalisasiReplyText(wait.expectedText || '');
  if (!expected) return false;
  return rapi === expected;
}

export function hitungRetrySendMessage(
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

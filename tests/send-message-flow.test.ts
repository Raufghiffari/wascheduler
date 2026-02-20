import { describe, expect, it } from 'vitest';
import { cckwaitrply, htngrtrysndmssg } from '../worker/send-message-flow';

describe('cckwaitrply', () => {
  it('mode any menerima reply non-kosong', () => {
    const cocok = cckwaitrply('  apa saja  ', {
      mode: 'any',
      startedAtMs: 1,
      timeoutAtMs: 2,
      blockIndex: 0,
    });
    expect(cocok).toBe(true);
  });

  it('mode exact ignore-case + trim', () => {
    const cocok = cckwaitrply('  P  ', {
      mode: 'exact',
      expectedText: 'p',
      startedAtMs: 1,
      timeoutAtMs: 2,
      blockIndex: 0,
    });
    expect(cocok).toBe(true);
  });

  it('mode exact menolak jika tidak sama persis', () => {
    const cocok = cckwaitrply('pp', {
      mode: 'exact',
      expectedText: 'p',
      startedAtMs: 1,
      timeoutAtMs: 2,
      blockIndex: 0,
    });
    expect(cocok).toBe(false);
  });
});

describe('htngrtrysndmssg', () => {
  it('percobaan ke-1 gagal -> boleh retry ke-2', () => {
    const hasil = htngrtrysndmssg(0, 1_000, 15_000, 3);
    expect(hasil.bisaLanjut).toBe(true);
    expect(hasil.retryCountBaru).toBe(1);
    expect(hasil.nextRetryAtMs).toBe(16_000);
  });

  it('sudah retry 2x gagal -> stop di percobaan ke-3', () => {
    const hasil = htngrtrysndmssg(2, 1_000, 15_000, 3);
    expect(hasil.bisaLanjut).toBe(false);
    expect(hasil.retryCountBaru).toBe(3);
  });
});

// tests/preview-waktu.test.ts
// Test helper preview waktu kirim dari input durasi.

import { describe, expect, it } from 'vitest';
import { formatPreviewPostAt } from '../shared/preview-waktu';

describe('formatPreviewPostAt', () => {
  it('16:00 + 10h20m => 02:20 tomorrow', () => {
    const now = new Date(2026, 1, 18, 16, 0, 0);
    const hasil = formatPreviewPostAt({ jam: 10, menit: 20, detik: 0 }, now);

    expect(hasil.teks).toBe('Will post at 02:20 tomorrow');
    expect(hasil.dayOffset).toBe(1);
  });

  it('10:00 + 2h => 12:00 (same day)', () => {
    const now = new Date(2026, 1, 18, 10, 0, 0);
    const hasil = formatPreviewPostAt({ jam: 2, menit: 0, detik: 0 }, now);

    expect(hasil.teks).toBe('Will post at 12:00');
    expect(hasil.dayOffset).toBe(0);
  });

  it('10:00 + 49h => in 2 days hint', () => {
    const now = new Date(2026, 1, 18, 10, 0, 0);
    const hasil = formatPreviewPostAt({ jam: 49, menit: 0, detik: 0 }, now);

    expect(hasil.teks).toContain('Will post at 11:00');
    expect(hasil.teks).toContain('in 2 days');
    expect(hasil.dayOffset).toBe(2);
  });
});

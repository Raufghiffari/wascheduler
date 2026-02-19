// tests/util-waktu.test.ts
// Test kecil buat memastikan kalkulasi durasi & window sesuai rule.

import { describe, it, expect } from 'vitest';
import { ubahDurasiKeMs, buatJendelaPengiriman } from '../shared/util-waktu';

describe('ubahDurasiKeMs', () => {
  it('menghitung jam/menit/detik dengan benar', () => {
    const ms = ubahDurasiKeMs(1, 2, 3);
    expect(ms).toBe((1 * 3600 + 2 * 60 + 3) * 1000);
  });

  it('nilai negatif dianggap 0', () => {
    const ms = ubahDurasiKeMs(-1, -2, -3);
    expect(ms).toBe(0);
  });
});

describe('buatJendelaPengiriman', () => {
  it('menghasilkan window 1 (2 menit) dan window 2 (2 menit) setelah jeda 10 menit', () => {
    const target = 1_000_000;
    const j = buatJendelaPengiriman(target);

    expect(j.jendela1MulaiMs).toBe(target);
    expect(j.jendela1AkhirMs).toBe(target + 2 * 60 * 1000);

    expect(j.jendela2MulaiMs).toBe(j.jendela1AkhirMs + 10 * 60 * 1000);
    expect(j.jendela2AkhirMs).toBe(j.jendela2MulaiMs + 2 * 60 * 1000);
  });
});

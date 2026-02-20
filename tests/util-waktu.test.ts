
import { describe, it, expect } from 'vitest';
import { ubhdrskems, buatjndlpngrmn } from '../shared/util-waktu';

describe('ubhdrskems', () => {
  it('menghitung jam/menit/detik dengan benar', () => {
    const ms = ubhdrskems(1, 2, 3);
    expect(ms).toBe((1 * 3600 + 2 * 60 + 3) * 1000);
  });

  it('nilai negatif dianggap 0', () => {
    const ms = ubhdrskems(-1, -2, -3);
    expect(ms).toBe(0);
  });
});

describe('buatjndlpngrmn', () => {
  it('menghasilkan window 1 (2 menit) dan window 2 (2 menit) setelah jeda 10 menit', () => {
    const target = 1_000_000;
    const j = buatjndlpngrmn(target);

    expect(j.jendela1MulaiMs).toBe(target);
    expect(j.jendela1AkhirMs).toBe(target + 2 * 60 * 1000);

    expect(j.jendela2MulaiMs).toBe(j.jendela1AkhirMs + 10 * 60 * 1000);
    expect(j.jendela2AkhirMs).toBe(j.jendela2MulaiMs + 2 * 60 * 1000);
  });
});

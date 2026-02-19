import { describe, expect, it } from 'vitest';
import { apakahFormatHashPassword, hashPassword, verifikasiPassword } from '../shared/password';

describe('password hash', () => {
  it('hash menghasilkan format scrypt yang valid', async () => {
    const hash = await hashPassword('secret-123');
    expect(apakahFormatHashPassword(hash)).toBe(true);
    expect(hash.startsWith('scrypt$')).toBe(true);
  });

  it('verifikasi password benar = true', async () => {
    const hash = await hashPassword('rahasia');
    const cocok = await verifikasiPassword('rahasia', hash);
    expect(cocok).toBe(true);
  });

  it('verifikasi password salah = false', async () => {
    const hash = await hashPassword('rahasia');
    const cocok = await verifikasiPassword('salah', hash);
    expect(cocok).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { apkhfrmthshpsswrd, hshpsswrd, vrfkspsswrd } from '../shared/password';

describe('password hash', () => {
  it('hash menghasilkan format scrypt yang valid', async () => {
    const hash = await hshpsswrd('secret-123');
    expect(apkhfrmthshpsswrd(hash)).toBe(true);
    expect(hash.startsWith('scrypt$')).toBe(true);
  });

  it('verifikasi password benar = true', async () => {
    const hash = await hshpsswrd('rahasia');
    const cocok = await vrfkspsswrd('rahasia', hash);
    expect(cocok).toBe(true);
  });

  it('verifikasi password salah = false', async () => {
    const hash = await hshpsswrd('rahasia');
    const cocok = await vrfkspsswrd('salah', hash);
    expect(cocok).toBe(false);
  });
});

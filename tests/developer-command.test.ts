
import { describe, expect, it } from 'vitest';
import { nrmlssdvlprcmmnd, rslvdvlprcmmnd } from '../shared/developer-command';

describe('nrmlssdvlprcmmnd', () => {
  it('trim + case-insensitive', () => {
    expect(nrmlssdvlprcmmnd('  @MyPreset.1  ')).toBe('@mypreset.1');
  });

  it('mengembalikan null jika command tidak valid', () => {
    expect(nrmlssdvlprcmmnd('@mypreset.9')).toBeNull();
  });
});

describe('rslvdvlprcmmnd', () => {
  it('@private.all hanya self', () => {
    const hasil = rslvdvlprcmmnd(
      '@private.all',
      ['628111@s.whatsapp.net', '628222@s.whatsapp.net'],
      '628999@s.whatsapp.net',
    );

    expect(hasil).toEqual(['628999@s.whatsapp.net']);
  });

  it('@mypreset.1 = semua kontak kecuali daftar preset 1', () => {
    const semua = [
      '6283842706631@s.whatsapp.net',
      '6285641820270@s.whatsapp.net',
      '628777000111@s.whatsapp.net',
    ];

    const hasil = rslvdvlprcmmnd('@mypreset.1', semua, '628999@s.whatsapp.net');

    expect(hasil).toContain('628999@s.whatsapp.net');
    expect(hasil).toContain('628777000111@s.whatsapp.net');
    expect(hasil).not.toContain('6283842706631@s.whatsapp.net');
    expect(hasil).not.toContain('6285641820270@s.whatsapp.net');
  });

  it('@mypreset.2 = semua kontak kecuali daftar preset 2', () => {
    const semua = [
      '6282134000050@s.whatsapp.net',
      '6285741541508@s.whatsapp.net',
      '6281234567890@s.whatsapp.net',
    ];

    const hasil = rslvdvlprcmmnd('@mypreset.2', semua, '628999@s.whatsapp.net');

    expect(hasil).toContain('628999@s.whatsapp.net');
    expect(hasil).toContain('6281234567890@s.whatsapp.net');
    expect(hasil).not.toContain('6282134000050@s.whatsapp.net');
    expect(hasil).not.toContain('6285741541508@s.whatsapp.net');
  });
});


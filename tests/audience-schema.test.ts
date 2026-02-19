// tests/audience-schema.test.ts
// Test normalisasi audience payload untuk create job API.

import { describe, expect, it } from 'vitest';
import { normalisasiAudienceBuatJob } from '../server/rute-api';

describe('normalisasiAudienceBuatJob', () => {
  it('menerima developer_command valid', () => {
    const hasil = normalisasiAudienceBuatJob({
      tipe: 'developer_command',
      command: '  @MyPreset.2  ',
    });

    expect(hasil.ok).toBe(true);
    if (!hasil.ok) return;
    expect(hasil.audience.tipe).toBe('developer_command');
    expect(hasil.audience.command).toBe('@mypreset.2');
  });

  it('menolak developer_command tidak valid', () => {
    const hasil = normalisasiAudienceBuatJob({
      tipe: 'developer_command',
      command: '@unknown.command',
    });

    expect(hasil.ok).toBe(false);
    if (hasil.ok) return;
    expect(hasil.pesan).toContain('Developer command tidak valid');
  });

  it('mode lama tetap berjalan', () => {
    const hasil = normalisasiAudienceBuatJob({
      tipe: 'my_contacts_excluded',
      daftarNomor: ['0812-1111-1111', '62812 1111 1111', '62813-2222-2222'],
    });

    expect(hasil.ok).toBe(true);
    if (!hasil.ok) return;
    expect(hasil.audience.tipe).toBe('my_contacts_excluded');
    expect(hasil.audience.daftarNomor).toEqual(['6281211111111', '6281322222222']);
  });
});


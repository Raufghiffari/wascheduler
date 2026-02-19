import { describe, expect, it } from 'vitest';
import { normalisasiDatabaseUntukTest } from '../db/penyimpanan';

describe('normalisasiDatabaseUntukTest', () => {
  it('migrasi versi 1 ke versi 2 + pindah data lama ke user env', async () => {
    process.env.DASH_USER = 'LegacyAdmin';
    process.env.DASH_PASS = 'legacy-pass';

    const legacy = {
      versi: 1,
      wa: {
        status: 'menghubungkan',
        qr: 'abc',
        terakhirUpdateMs: 10,
        nomor: null,
        catatan: 'legacy',
      },
      job: [
        {
          id: 'job-1',
          dibuatPadaMs: 1,
          jenis: 'wa_status',
          targetMs: 2,
          status: 'queued',
          attemptCount: 0,
          jendela: {
            jendela1MulaiMs: 1,
            jendela1AkhirMs: 2,
            jendela2MulaiMs: 3,
            jendela2AkhirMs: 4,
          },
          media: {
            namaAsli: 'a.jpg',
            pathRelatif: 'media/a.jpg',
            mime: 'image/jpeg',
            tipe: 'foto',
            ukuranByte: 10,
          },
          audience: { tipe: 'my_contacts' },
        },
      ],
      log: [
        {
          id: 'log-1',
          waktuMs: 1,
          jenis: 'buat_job',
          detail: {},
        },
      ],
    };

    const hasil = await normalisasiDatabaseUntukTest(legacy);
    const userEnv = hasil.users.find((u) => u.nameLower === 'legacyadmin');

    expect(hasil.versi).toBe(2);
    expect(userEnv).toBeTruthy();
    if (!userEnv) return;

    expect(hasil.waByUser[userEnv.id]?.status).toBe('menghubungkan');
    expect(hasil.job[0]?.userId).toBe(userEnv.id);
    expect(hasil.log[0]?.userId).toBe(userEnv.id);
  });
});

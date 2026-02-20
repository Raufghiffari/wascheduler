import { describe, expect, it } from 'vitest';
import { nrmlsssndmssgbuatjob } from '../server/rute-api';

describe('nrmlsssndmssgbuatjob', () => {
  it('menerima payload valid + normalisasi nomor', () => {
    const hasil = nrmlsssndmssgbuatjob({
      nomorTujuan: '0812-3456-7890',
      pesanAwal: 'Halo',
      media: undefined,
      blok: [
        {
          jenis: 'delay',
          durasi: { jam: 0, menit: 1, detik: 0 },
        },
        {
          jenis: 'wait_reply',
          mode: 'exact',
          expectedText: 'p',
        },
        {
          jenis: 'send_message',
          pesan: 'Oke, jadi ...',
        },
      ],
    });

    expect(hasil.ok).toBe(true);
    if (!hasil.ok) return;
    expect(hasil.sendMessage.nomorTujuan).toBe('6281234567890');
    expect(hasil.sendMessage.blok).toHaveLength(3);
    expect(hasil.sendMessage.progress.initialSent).toBe(false);
    expect(hasil.sendMessage.progress.nextBlockIndex).toBe(0);
  });

  it('menolak block delay jika 0', () => {
    const hasil = nrmlsssndmssgbuatjob({
      nomorTujuan: '6281234567890',
      pesanAwal: 'Halo',
      media: undefined,
      blok: [
        {
          jenis: 'delay',
          durasi: { jam: 0, menit: 0, detik: 0 },
        },
      ],
    });

    expect(hasil.ok).toBe(false);
    if (hasil.ok) return;
    expect(hasil.pesan).toContain('delay');
  });

  it('menolak wait_reply exact tanpa expected text', () => {
    const hasil = nrmlsssndmssgbuatjob({
      nomorTujuan: '6281234567890',
      pesanAwal: 'Halo',
      media: undefined,
      blok: [
        {
          jenis: 'wait_reply',
          mode: 'exact',
          expectedText: '   ',
        },
      ],
    });

    expect(hasil.ok).toBe(false);
    if (hasil.ok) return;
    expect(hasil.pesan).toContain('expected');
  });

  it('menolak block send_message kosong', () => {
    const hasil = nrmlsssndmssgbuatjob({
      nomorTujuan: '6281234567890',
      pesanAwal: 'Halo',
      media: undefined,
      blok: [
        {
          jenis: 'send_message',
          pesan: '   ',
        },
      ],
    });

    expect(hasil.ok).toBe(false);
    if (hasil.ok) return;
    expect(hasil.pesan).toContain('send_message');
  });
});


import { describe, expect, it } from 'vitest';
import { DbBusyError, ptknerrrlckdtbs } from '../db/penyimpanan';

describe('ptknerrrlckdtbs', () => {
  it('map ELOCKED menjadi DbBusyError', () => {
    const err = Object.assign(new Error('Lock file is already being held'), {
      code: 'ELOCKED',
    });

    const hasil = ptknerrrlckdtbs(err);
    expect(hasil).toBeInstanceOf(DbBusyError);
  });

  it('map compromised lock menjadi DbBusyError', () => {
    const err = Object.assign(new Error('Lock is compromised'), {
      code: 'ECOMPROMISED',
    });

    const hasil = ptknerrrlckdtbs(err);
    expect(hasil).toBeInstanceOf(DbBusyError);
  });

  it('error lain tidak diubah menjadi DbBusyError', () => {
    const err = new Error('random error');
    const hasil = ptknerrrlckdtbs(err);
    expect(hasil).toBe(err);
    expect(hasil).not.toBeInstanceOf(DbBusyError);
  });
});


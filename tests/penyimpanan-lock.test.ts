// tests/penyimpanan-lock.test.ts
// Test pemetaan error lock database.

import { describe, expect, it } from 'vitest';
import { DbBusyError, petakanErrorLockDatabase } from '../db/penyimpanan';

describe('petakanErrorLockDatabase', () => {
  it('map ELOCKED menjadi DbBusyError', () => {
    const err = Object.assign(new Error('Lock file is already being held'), {
      code: 'ELOCKED',
    });

    const hasil = petakanErrorLockDatabase(err);
    expect(hasil).toBeInstanceOf(DbBusyError);
  });

  it('map compromised lock menjadi DbBusyError', () => {
    const err = Object.assign(new Error('Lock is compromised'), {
      code: 'ECOMPROMISED',
    });

    const hasil = petakanErrorLockDatabase(err);
    expect(hasil).toBeInstanceOf(DbBusyError);
  });

  it('error lain tidak diubah menjadi DbBusyError', () => {
    const err = new Error('random error');
    const hasil = petakanErrorLockDatabase(err);
    expect(hasil).toBe(err);
    expect(hasil).not.toBeInstanceOf(DbBusyError);
  });
});


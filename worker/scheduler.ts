
import type { JobScheduleWaStatus } from '../shared/tipe';

export type TahapJadwal = 'belum_waktu' | 'jendela_1' | 'tunggu_10_menit' | 'jendela_2' | 'kadaluarsa';

export function tntknthp(job: JobScheduleWaStatus, sekarang: number): TahapJadwal {
  const { jendela1MulaiMs, jendela1AkhirMs, jendela2MulaiMs, jendela2AkhirMs } = job.jendela;

  if (sekarang < jendela1MulaiMs) return 'belum_waktu';
  if (sekarang >= jendela1MulaiMs && sekarang <= jendela1AkhirMs) return 'jendela_1';
  if (sekarang > jendela1AkhirMs && sekarang < jendela2MulaiMs) return 'tunggu_10_menit';
  if (sekarang >= jendela2MulaiMs && sekarang <= jendela2AkhirMs) return 'jendela_2';
  return 'kadaluarsa';
}

export function amblakhrwndwaktf(job: JobScheduleWaStatus, sekarang: number): number | null {
  const tahap = tntknthp(job, sekarang);

  if (tahap === 'jendela_1') return job.jendela.jendela1AkhirMs;
  if (tahap === 'jendela_2') return job.jendela.jendela2AkhirMs;

  return null;
}

export function htngbrktnycoba(
  sekarang: number,
  akhirWindow: number,
  intervalMs: number,
): number | null {
  const next = sekarang + intervalMs;
  if (next <= akhirWindow) return next;

  return null;
}

export function jobmshaktf(job: { status: string }): boolean {
  return job.status !== 'success' && job.status !== 'cancel';
}

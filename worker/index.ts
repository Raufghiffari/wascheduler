// worker/index.ts
// Entrypoint worker: scheduler + eksekusi job + pengiriman WhatsApp.

import 'dotenv/config';
import fs from 'fs/promises';
import {
  DbBusyError,
  bacaDatabase,
  ubahDatabase,
  ubahPathRelatifKeAbsolut,
  tambahLog,
  buatStatusWaAwal,
} from '../db/penyimpanan';
import type {
  JobSchedule,
  JobScheduleSendMessage,
  JobScheduleWaStatus,
  SendMessageProgress,
  SendMessageWaitingReply,
} from '../shared/tipe';
import { sekarangMs, ubahDurasiKeMs } from '../shared/util-waktu';
import { ubahNomorKeJid } from '../shared/util-nomor';
import { ambilGuardInstance, InstanceLockedError } from '../shared/instance-guard';
import { sambungkanWhatsapp } from './whatsapp';
import type { PengirimWhatsapp } from './whatsapp';
import { ambilAkhirWindowAktif, hitungBerikutnyaCoba, jobMasihAktif, tentukanTahap } from './scheduler';
import { cocokWaitReply, hitungRetrySendMessage } from './send-message-flow';

const intervalPollingMs = 1000;
const intervalSyncPengirimMs = 3000;
const intervalRetryDalamWindowMs = 15_000;
const intervalRetrySendMessageMs = 15_000;
const maxPercobaanKirimPesan = 3;
const timeoutWaitReplyMs = 24 * 60 * 60 * 1000;
const intervalLogGuardMs = 30_000;
const intervalSessionDesyncLogMs = 60_000;
let sudahPasangHandlerShutdown = false;
let terakhirLogDbBusyMs = 0;
let terakhirLogSchedulerGuardMs = 0;
const terakhirLogSessionDesyncPerUser = new Map<string, number>();

function ringkasError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  return String(err);
}

function apakahSessionTidakSinkron(err: unknown): boolean {
  const teks = String(
    [
      err instanceof Error ? err.name : '',
      err instanceof Error ? err.message : '',
      err instanceof Error ? err.stack : '',
      String(err),
    ].join(' '),
  ).toLowerCase();

  return (
    teks.includes('prekeyerror') ||
    teks.includes('invalid prekey id') ||
    teks.includes('no senderkeyrecord found for decryption')
  );
}

function apakahJobWaStatus(job: JobSchedule): job is JobScheduleWaStatus {
  return job.jenis !== 'send_message' && Boolean((job as JobScheduleWaStatus).media && (job as JobScheduleWaStatus).audience);
}

function apakahJobSendMessage(job: JobSchedule): job is JobScheduleSendMessage {
  return job.jenis === 'send_message' && Boolean((job as JobScheduleSendMessage).sendMessage);
}

function pastikanProgressSendMessage(job: JobScheduleSendMessage): SendMessageProgress {
  if (!job.sendMessage.progress) {
    job.sendMessage.progress = {
      initialSent: false,
      nextBlockIndex: 0,
      pendingSend: {
        tahap: 'initial',
        retryCount: 0,
      },
    };
  }

  if (typeof job.sendMessage.progress.initialSent !== 'boolean') {
    job.sendMessage.progress.initialSent = false;
  }

  if (!Number.isFinite(job.sendMessage.progress.nextBlockIndex)) {
    job.sendMessage.progress.nextBlockIndex = 0;
  }

  if (job.sendMessage.progress.nextBlockIndex < 0) {
    job.sendMessage.progress.nextBlockIndex = 0;
  }

  return job.sendMessage.progress;
}

function tandaiJobGagal(job: JobSchedule, pesan: string, now: number): void {
  job.status = 'failed';
  job.terakhirError = pesan;
  job.selesaiMs = now;
  job.berikutnyaCobaMs = undefined;
}

async function tandaiSessionTidakSinkron(userId: string, pesanError: string): Promise<void> {
  const now = sekarangMs();
  const terakhir = terakhirLogSessionDesyncPerUser.get(userId) || 0;
  if (now - terakhir < intervalSessionDesyncLogMs) return;
  terakhirLogSessionDesyncPerUser.set(userId, now);

  await ubahDatabase((db) => {
    if (!db.waByUser[userId]) {
      db.waByUser[userId] = buatStatusWaAwal(now);
    }

    db.waByUser[userId].status = 'menghubungkan';
    db.waByUser[userId].catatan = 'Sesi WA tidak sinkron. Hapus folder wa_auth user lalu scan ulang.';
    db.waByUser[userId].terakhirUpdateMs = now;
  }).catch(() => null);

  await tambahLog('wa_session_desync', {
    error: pesanError,
    waktuMs: now,
  }, userId).catch(() => null);
}

function pasangHandlerShutdown(aksiLepas: () => Promise<void>): void {
  if (sudahPasangHandlerShutdown) return;
  sudahPasangHandlerShutdown = true;

  let sedangLepas = false;
  const lepasSekali = async (): Promise<void> => {
    if (sedangLepas) return;
    sedangLepas = true;
    await aksiLepas().catch(() => null);
  };

  process.once('SIGINT', () => {
    void lepasSekali().finally(() => process.exit(0));
  });

  process.once('SIGTERM', () => {
    void lepasSekali().finally(() => process.exit(0));
  });

  process.once('exit', () => {
    void lepasSekali();
  });
}

// Fungsi ini membaca env untuk menentukan apakah file media dihapus setelah job selesai.
function bolehHapusMediaSetelahSelesai(): boolean {
  return String(process.env.HAPUS_MEDIA_SETELAH_SELESAI || '0') === '1';
}

function ambilDaftarPathMedia(job: JobSchedule): string[] {
  const daftar = new Set<string>();

  if (job.media?.pathRelatif) {
    daftar.add(job.media.pathRelatif);
  }

  if (apakahJobSendMessage(job) && job.sendMessage.media?.pathRelatif) {
    daftar.add(job.sendMessage.media.pathRelatif);
  }

  return [...daftar];
}

// Fungsi ini mencoba menghapus file media, tapi tidak melempar error kalau gagal.
async function cobaHapusMedia(job: JobSchedule): Promise<void> {
  if (!bolehHapusMediaSetelahSelesai()) return;

  const daftarPath = ambilDaftarPathMedia(job);
  for (const pathRelatif of daftarPath) {
    try {
      const pathAbs = ubahPathRelatifKeAbsolut(pathRelatif);
      await fs.unlink(pathAbs);
    } catch {
      // abaikan
    }
  }
}

// Fungsi ini memproses job yang sudah kadaluarsa (melewati window 2).
async function batalkanKalauKadaluarsa(jobId: string, userId: string, alasan: string): Promise<void> {
  await ubahDatabase((db) => {
    const job = db.job.find((j) => j.id === jobId && j.userId === userId);
    if (!job) return;
    if (job.status === 'success' || job.status === 'cancel') return;

    job.status = 'cancel';
    job.terakhirError = alasan;
    job.selesaiMs = sekarangMs();
    job.berikutnyaCobaMs = undefined;
  });

  await tambahLog('cancel_job', { id: jobId, alasan }, userId);
}

// Fungsi ini menjalankan 1 percobaan kirim status untuk 1 job wa_status.
async function cobaKirimSatuJobStatus(
  pengirim: PengirimWhatsapp,
  jobId: string,
  userId: string,
  sedangDiproses: Set<string>,
): Promise<void> {
  const keyProses = `${userId}:${jobId}`;
  if (sedangDiproses.has(keyProses)) return;
  sedangDiproses.add(keyProses);

  const now = sekarangMs();

  // Ambil snapshot job + tandai running + increment attempt.
  let snapshot: JobScheduleWaStatus | null = null;

  await ubahDatabase((db) => {
    const job = db.job.find((j) => j.id === jobId && j.userId === userId);
    if (!job) return;
    if (!jobMasihAktif(job)) return;
    if (!apakahJobWaStatus(job)) return;

    // Jangan kirim kalau belum waktunya (double-check).
    const tahap = tentukanTahap(job, now);
    if (tahap === 'belum_waktu' || tahap === 'tunggu_10_menit') return;
    if (tahap === 'kadaluarsa') return;

    job.status = 'running';
    job.attemptCount += 1;
    job.terakhirAttemptMs = now;
    job.berikutnyaCobaMs = undefined;

    snapshot = JSON.parse(JSON.stringify(job)) as JobScheduleWaStatus;
  });

  if (!snapshot) {
    sedangDiproses.delete(keyProses);
    return;
  }

  try {
    await pengirim.kirimStatusDariJob(snapshot);

    await ubahDatabase((db) => {
      const job = db.job.find((j) => j.id === jobId && j.userId === userId);
      if (!job) return;

      job.status = 'success';
      job.selesaiMs = sekarangMs();
      job.terakhirError = undefined;
      job.berikutnyaCobaMs = undefined;
    });

    // Cleanup optional
    await cobaHapusMedia(snapshot);
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);

    await tambahLog('kirim_status_gagal', {
      jobId,
      error: pesan,
    }, userId).catch(() => null);

    if (apakahSessionTidakSinkron(err)) {
      await tandaiSessionTidakSinkron(userId, pesan);
    }

    await ubahDatabase((db) => {
      const job = db.job.find((j) => j.id === jobId && j.userId === userId);
      if (!job) return;
      if (!jobMasihAktif(job)) return;
      if (!apakahJobWaStatus(job)) return;

      job.status = 'failed';
      job.terakhirError = pesan;

      const akhir = ambilAkhirWindowAktif(job, now);
      if (akhir) {
        const next = hitungBerikutnyaCoba(now, akhir, intervalRetryDalamWindowMs);
        job.berikutnyaCobaMs = next ?? undefined;
      } else {
        job.berikutnyaCobaMs = undefined;
      }
    }).catch(() => null);
  } finally {
    sedangDiproses.delete(keyProses);
  }
}

type AksiSendMessage =
  | { tipe: 'none' }
  | {
      tipe: 'kirim';
      opsi: {
        jobId: string;
        nomorTujuan: string;
        pesan: string;
        tahap: 'initial' | 'block';
        blockIndex?: number;
        media?: JobScheduleSendMessage['sendMessage']['media'];
        attemptKe: number;
      };
    }
  | {
      tipe: 'cek_wait_reply';
      jobId: string;
      nomorTujuan: string;
      wait: SendMessageWaitingReply;
    };

async function prosesJobSendMessage(
  pengirim: Pick<PengirimWhatsapp, 'kirimPesanLangsung' | 'daftarPesanPribadiSejak'>,
  jobId: string,
  userId: string,
  sedangDiproses: Set<string>,
): Promise<void> {
  const keyProses = `${userId}:${jobId}`;
  if (sedangDiproses.has(keyProses)) return;
  sedangDiproses.add(keyProses);

  const now = sekarangMs();
  const aksiRef: { value: AksiSendMessage } = { value: { tipe: 'none' } };

  await ubahDatabase((db) => {
    const job = db.job.find((item) => item.id === jobId && item.userId === userId);
    if (!job) return;
    if (!jobMasihAktif(job)) return;
    if (!apakahJobSendMessage(job)) return;

    if (job.status === 'queued') {
      if (now < job.targetMs) return;
      job.status = 'running';
    }

    const progress = pastikanProgressSendMessage(job);
    if (job.berikutnyaCobaMs && now < job.berikutnyaCobaMs) return;
    if (job.berikutnyaCobaMs && now >= job.berikutnyaCobaMs) {
      job.berikutnyaCobaMs = undefined;
    }

    if (progress.waitingReply) {
      aksiRef.value = {
        tipe: 'cek_wait_reply',
        jobId: job.id,
        nomorTujuan: job.sendMessage.nomorTujuan,
        wait: { ...progress.waitingReply },
      };
      return;
    }

    if (progress.pendingSend) {
      if (progress.pendingSend.nextRetryAtMs && now < progress.pendingSend.nextRetryAtMs) {
        job.berikutnyaCobaMs = progress.pendingSend.nextRetryAtMs;
        return;
      }

      if (progress.pendingSend.tahap === 'initial') {
        job.attemptCount += 1;
        job.terakhirAttemptMs = now;
        aksiRef.value = {
          tipe: 'kirim',
          opsi: {
            jobId: job.id,
            nomorTujuan: job.sendMessage.nomorTujuan,
            pesan: job.sendMessage.pesanAwal,
            media: job.sendMessage.media,
            tahap: 'initial',
            attemptKe: progress.pendingSend.retryCount + 1,
          },
        };
        return;
      }

      const idx = Number(progress.pendingSend.blockIndex);
      const block = Number.isInteger(idx) ? job.sendMessage.blok[idx] : null;
      if (!block || block.jenis !== 'send_message') {
        tandaiJobGagal(job, 'Block send_message tidak valid.', now);
        progress.pendingSend = undefined;
        return;
      }

      job.attemptCount += 1;
      job.terakhirAttemptMs = now;
      aksiRef.value = {
        tipe: 'kirim',
        opsi: {
          jobId: job.id,
          nomorTujuan: job.sendMessage.nomorTujuan,
          pesan: block.pesan,
          tahap: 'block',
          blockIndex: idx,
          attemptKe: progress.pendingSend.retryCount + 1,
        },
      };
      return;
    }

    if (!progress.initialSent) {
      progress.pendingSend = {
        tahap: 'initial',
        retryCount: 0,
      };
      job.attemptCount += 1;
      job.terakhirAttemptMs = now;
      aksiRef.value = {
        tipe: 'kirim',
        opsi: {
          jobId: job.id,
          nomorTujuan: job.sendMessage.nomorTujuan,
          pesan: job.sendMessage.pesanAwal,
          media: job.sendMessage.media,
          tahap: 'initial',
          attemptKe: 1,
        },
      };
      return;
    }

    const block = job.sendMessage.blok[progress.nextBlockIndex];
    if (!block) {
      job.status = 'success';
      job.selesaiMs = now;
      job.terakhirError = undefined;
      job.berikutnyaCobaMs = undefined;
      return;
    }

    if (block.jenis === 'delay') {
      const delayMs = ubahDurasiKeMs(block.durasi.jam, block.durasi.menit, block.durasi.detik);
      if (delayMs <= 0) {
        tandaiJobGagal(job, 'Delay block harus lebih dari 0.', now);
        return;
      }
      progress.nextBlockIndex += 1;
      job.berikutnyaCobaMs = now + delayMs;
      return;
    }

    if (block.jenis === 'wait_reply') {
      progress.waitingReply = {
        mode: block.mode,
        expectedText: block.expectedText,
        startedAtMs: now,
        timeoutAtMs: now + timeoutWaitReplyMs,
        blockIndex: progress.nextBlockIndex,
      };
      return;
    }

    progress.pendingSend = {
      tahap: 'block',
      blockIndex: progress.nextBlockIndex,
      retryCount: 0,
    };
    job.attemptCount += 1;
    job.terakhirAttemptMs = now;
    aksiRef.value = {
      tipe: 'kirim',
      opsi: {
        jobId: job.id,
        nomorTujuan: job.sendMessage.nomorTujuan,
        pesan: block.pesan,
        tahap: 'block',
        blockIndex: progress.nextBlockIndex,
        attemptKe: 1,
      },
    };
  });

  try {
    const aksi = aksiRef.value;
    if (aksi.tipe === 'kirim') {
      await pengirim.kirimPesanLangsung(aksi.opsi);

      const nowSukses = sekarangMs();
      await ubahDatabase((db) => {
        const job = db.job.find((item) => item.id === jobId && item.userId === userId);
        if (!job) return;
        if (!jobMasihAktif(job)) return;
        if (!apakahJobSendMessage(job)) return;

        const progress = pastikanProgressSendMessage(job);
        const pending = progress.pendingSend;
        if (!pending) return;

        if (pending.tahap === 'initial') {
          progress.initialSent = true;
          progress.pendingSend = undefined;
          progress.nextBlockIndex = 0;
          job.berikutnyaCobaMs = undefined;
          job.terakhirError = undefined;
          return;
        }

        const idx = Number(pending.blockIndex);
        const nextBlockIndex = Number.isInteger(idx) ? idx + 1 : progress.nextBlockIndex + 1;
        progress.nextBlockIndex = nextBlockIndex;
        progress.pendingSend = undefined;
        job.berikutnyaCobaMs = undefined;
        job.terakhirError = undefined;

        if (nextBlockIndex >= job.sendMessage.blok.length) {
          job.status = 'success';
          job.selesaiMs = nowSukses;
        }
      });
      return;
    }

    if (aksi.tipe === 'cek_wait_reply') {
      const jid = ubahNomorKeJid(aksi.nomorTujuan);
      const nowCek = sekarangMs();

      if (!jid) {
        await ubahDatabase((db) => {
          const job = db.job.find((item) => item.id === jobId && item.userId === userId);
          if (!job || !jobMasihAktif(job)) return;
          tandaiJobGagal(job, 'Nomor tujuan tidak valid.', nowCek);
        });
        return;
      }

      const daftarPesan = pengirim.daftarPesanPribadiSejak(jid, aksi.wait.startedAtMs);
      const pesanCocok = daftarPesan.find((item) => cocokWaitReply(item.teks, aksi.wait));

      if (pesanCocok) {
        await ubahDatabase((db) => {
          const job = db.job.find((item) => item.id === jobId && item.userId === userId);
          if (!job) return;
          if (!jobMasihAktif(job)) return;
          if (!apakahJobSendMessage(job)) return;

          const progress = pastikanProgressSendMessage(job);
          if (!progress.waitingReply) return;
          if (progress.waitingReply.startedAtMs !== aksi.wait.startedAtMs) return;

          progress.waitingReply = undefined;
          progress.terakhirReplyCocokMs = pesanCocok.waktuMs;
          progress.nextBlockIndex = aksi.wait.blockIndex + 1;
          job.berikutnyaCobaMs = undefined;
          job.terakhirError = undefined;
        });
        return;
      }

      if (nowCek > aksi.wait.timeoutAtMs) {
        await ubahDatabase((db) => {
          const job = db.job.find((item) => item.id === jobId && item.userId === userId);
          if (!job) return;
          if (!jobMasihAktif(job)) return;
          if (!apakahJobSendMessage(job)) return;

          const progress = pastikanProgressSendMessage(job);
          progress.waitingReply = undefined;
          tandaiJobGagal(job, 'Wait reply timeout (24h).', nowCek);
        });

        await tambahLog('wait_reply_timeout', {
          jobId,
          nomorTujuan: aksi.nomorTujuan,
          wait: aksi.wait,
        }, userId).catch(() => null);
      }
    }
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    const nowGagal = sekarangMs();

    if (apakahSessionTidakSinkron(err)) {
      await tandaiSessionTidakSinkron(userId, pesan);
    }

    await ubahDatabase((db) => {
      const job = db.job.find((item) => item.id === jobId && item.userId === userId);
      if (!job) return;
      if (!jobMasihAktif(job)) return;
      if (!apakahJobSendMessage(job)) return;

      const progress = pastikanProgressSendMessage(job);
      const pending = progress.pendingSend;
      if (!pending) return;

      const retry = hitungRetrySendMessage(
        pending.retryCount,
        nowGagal,
        intervalRetrySendMessageMs,
        maxPercobaanKirimPesan,
      );
      if (!retry.bisaLanjut) {
        progress.pendingSend = undefined;
        tandaiJobGagal(job, pesan, nowGagal);
        return;
      }

      pending.retryCount = retry.retryCountBaru;
      pending.lastError = pesan;
      pending.nextRetryAtMs = retry.nextRetryAtMs;
      job.berikutnyaCobaMs = pending.nextRetryAtMs;
      job.terakhirError = pesan;
      job.status = 'running';
    }).catch(() => null);
  } finally {
    sedangDiproses.delete(keyProses);
  }
}

// Fungsi ini memproses semua job secara periodik.
async function prosesSemuaJob(
  pengirimByUser: Map<string, PengirimWhatsapp>,
  sedangDiproses: Set<string>,
): Promise<void> {
  const now = sekarangMs();
  const db = await bacaDatabase();

  for (const job of db.job) {
    if (!jobMasihAktif(job)) continue;

    const pengirim = pengirimByUser.get(job.userId);
    if (!pengirim) continue;

    if (apakahJobSendMessage(job)) {
      await prosesJobSendMessage(pengirim, job.id, job.userId, sedangDiproses);
      continue;
    }

    if (!apakahJobWaStatus(job)) continue;

    const tahap = tentukanTahap(job, now);

    // Kadaluarsa -> cancel
    if (tahap === 'kadaluarsa') {
      await batalkanKalauKadaluarsa(job.id, job.userId, 'Window pengiriman habis.');
      await cobaHapusMedia(job);
      continue;
    }

    // Masa tunggu 10 menit -> set berikutnyaCobaMs ke awal window 2 (sekali saja)
    if (tahap === 'tunggu_10_menit') {
      if (!job.berikutnyaCobaMs || job.berikutnyaCobaMs < job.jendela.jendela2MulaiMs) {
        await ubahDatabase((db2) => {
          const j = db2.job.find((x) => x.id === job.id && x.userId === job.userId);
          if (!j) return;
          if (!jobMasihAktif(j)) return;
          if (!apakahJobWaStatus(j)) return;
          j.berikutnyaCobaMs = j.jendela.jendela2MulaiMs;
        });
      }
      continue;
    }

    // Dalam window aktif -> coba kirim kalau waktunya.
    if (tahap === 'jendela_1' || tahap === 'jendela_2') {
      if (job.berikutnyaCobaMs && now < job.berikutnyaCobaMs) continue;
      await cobaKirimSatuJobStatus(pengirim, job.id, job.userId, sedangDiproses);
      continue;
    }

    // belum waktu -> skip
  }
}

async function sinkronkanPengirimWhatsapp(
  pengirimByUser: Map<string, PengirimWhatsapp>,
  sedangInisialisasi: Set<string>,
): Promise<void> {
  const db = await bacaDatabase();
  const daftarUserId = db.users.map((u) => u.id);

  for (const userId of daftarUserId) {
    if (pengirimByUser.has(userId)) continue;
    if (sedangInisialisasi.has(userId)) continue;

    sedangInisialisasi.add(userId);
    void sambungkanWhatsapp(userId)
      .then((pengirim) => {
        pengirimByUser.set(userId, pengirim);
      })
      .catch((err) => {
        void tambahLog('wa_status', {
          status: 'menghubungkan',
          catatan: `Gagal inisialisasi socket user: ${ringkasError(err)}`,
        }, userId).catch(() => null);
      })
      .finally(() => {
        sedangInisialisasi.delete(userId);
      });
  }
}

// Fungsi ini menjalankan loop scheduler tanpa cron (polling + timer).
export async function jalankanWorker(): Promise<void> {
  try {
    const guard = await ambilGuardInstance('worker');

    pasangHandlerShutdown(async () => {
      await guard.lepas();
    });
  } catch (err) {
    if (err instanceof InstanceLockedError) {
      await tambahLog('instance_guard', {
        proses: 'worker',
        status: 'ditolak',
        pesan: err.message,
      }).catch(() => null);
    }
    throw err;
  }

  const pengirimByUser = new Map<string, PengirimWhatsapp>();
  const sedangInisialisasiUser = new Set<string>();
  const sedangDiproses = new Set<string>();
  let tickBerjalan = false;

  await sinkronkanPengirimWhatsapp(pengirimByUser, sedangInisialisasiUser);

  setInterval(() => {
    void sinkronkanPengirimWhatsapp(pengirimByUser, sedangInisialisasiUser).catch(() => null);
  }, intervalSyncPengirimMs);

  // eslint-disable-next-line no-console
  console.log('[worker] scheduler aktif');

  setInterval(() => {
    if (tickBerjalan) {
      const now = sekarangMs();
      if (now - terakhirLogSchedulerGuardMs >= intervalLogGuardMs) {
        terakhirLogSchedulerGuardMs = now;
        // eslint-disable-next-line no-console
        console.warn('[worker] skip tick: loop sebelumnya masih berjalan');
        void tambahLog('scheduler_guard', {
          pesan: 'Skip tick karena proses loop sebelumnya belum selesai.',
          waktuMs: now,
        }).catch(() => null);
      }
      return;
    }

    tickBerjalan = true;
    prosesSemuaJob(pengirimByUser, sedangDiproses)
      .catch((err) => {
        if (err instanceof DbBusyError) {
          const now = sekarangMs();
          if (now - terakhirLogDbBusyMs >= intervalLogGuardMs) {
            terakhirLogDbBusyMs = now;
            void tambahLog('db_busy', {
              proses: 'worker_loop',
              pesan: err.message,
              waktuMs: now,
            }).catch(() => null);
          }
          return;
        }

        // eslint-disable-next-line no-console
        console.error('[worker] error di loop:', ringkasError(err));
      })
      .finally(() => {
        tickBerjalan = false;
      });
  }, intervalPollingMs);
}

// Jalankan kalau file ini dieksekusi langsung.
if (require.main === module) {
  jalankanWorker().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[worker] gagal start:', err);
    process.exit(1);
  });
}

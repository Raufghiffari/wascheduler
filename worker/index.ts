
import 'dotenv/config';
import fs from 'fs/promises';
import {
  DbBusyError,
  bacadtbs,
  ubhdtbs,
  ubhpthrltfkeabslt,
  tmbhlog,
  buatsttswaawl,
} from '../db/penyimpanan';
import type {
  JobSchedule,
  JobScheduleSendMessage,
  JobScheduleWaStatus,
  SendMessageProgress,
  SendMessageWaitingReply,
} from '../shared/tipe';
import { skrngms, ubhdrskems } from '../shared/util-waktu';
import { ubhnmrkejid } from '../shared/util-nomor';
import { amblgrdinstnc, InstanceLockedError } from '../shared/instance-guard';
import { smbngknwhtspp } from './whatsapp';
import type { PengirimWhatsapp } from './whatsapp';
import { amblakhrwndwaktf, htngbrktnycoba, jobmshaktf, tntknthp } from './scheduler';
import { cckwaitrply, htngrtrysndmssg } from './send-message-flow';

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

function rngkserrr(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  return String(err);
}

function apkhsssntdksnkrn(err: unknown): boolean {
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

function apkhjobwastts(job: JobSchedule): job is JobScheduleWaStatus {
  return job.jenis !== 'send_message' && Boolean((job as JobScheduleWaStatus).media && (job as JobScheduleWaStatus).audience);
}

function apkhjobsndmssg(job: JobSchedule): job is JobScheduleSendMessage {
  return job.jenis === 'send_message' && Boolean((job as JobScheduleSendMessage).sendMessage);
}

function pstknprgrsssndmssg(job: JobScheduleSendMessage): SendMessageProgress {
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

function tndjobggl(job: JobSchedule, pesan: string, now: number): void {
  job.status = 'failed';
  job.terakhirError = pesan;
  job.selesaiMs = now;
  job.berikutnyaCobaMs = undefined;
}

async function tndsssntdksnkrn(userId: string, pesanError: string): Promise<void> {
  const now = skrngms();
  const terakhir = terakhirLogSessionDesyncPerUser.get(userId) || 0;
  if (now - terakhir < intervalSessionDesyncLogMs) return;
  terakhirLogSessionDesyncPerUser.set(userId, now);

  await ubhdtbs((db) => {
    if (!db.waByUser[userId]) {
      db.waByUser[userId] = buatsttswaawl(now);
    }

    db.waByUser[userId].status = 'menghubungkan';
    db.waByUser[userId].catatan = 'Sesi WA tidak sinkron. Hapus folder wa_auth user lalu scan ulang.';
    db.waByUser[userId].terakhirUpdateMs = now;
  }).catch(() => null);

  await tmbhlog('wa_session_desync', {
    error: pesanError,
    waktuMs: now,
  }, userId).catch(() => null);
}

function psnghndlrshtdwn(aksiLepas: () => Promise<void>): void {
  if (sudahPasangHandlerShutdown) return;
  sudahPasangHandlerShutdown = true;

  let sedangLepas = false;
  const lpsskl = async (): Promise<void> => {
    if (sedangLepas) return;
    sedangLepas = true;
    await aksiLepas().catch(() => null);
  };

  process.once('SIGINT', () => {
    void lpsskl().finally(() => process.exit(0));
  });

  process.once('SIGTERM', () => {
    void lpsskl().finally(() => process.exit(0));
  });

  process.once('exit', () => {
    void lpsskl();
  });
}

function ambldftrpthmedia(job: JobSchedule): string[] {
  const daftar = new Set<string>();

  if (job.media?.pathRelatif) {
    daftar.add(job.media.pathRelatif);
  }

  if (apkhjobsndmssg(job) && job.sendMessage.media?.pathRelatif) {
    daftar.add(job.sendMessage.media.pathRelatif);
  }

  return [...daftar];
}

function jbsls(job: JobSchedule): boolean {
  return job.status === 'success' || job.status === 'cancel';
}

async function autoadptmedia(jobId: string, userId: string): Promise<void> {
  const db = await bacadtbs();
  const job = db.job.find((item) => item.id === jobId && item.userId === userId);
  if (!job) return;
  if (!jbsls(job)) return;

  const kandidat = ambldftrpthmedia(job);
  if (kandidat.length === 0) return;

  const dipakaiAktif = new Set<string>();
  for (const item of db.job) {
    if (item.id === jobId && item.userId === userId) continue;
    if (jbsls(item)) continue;
    for (const pathRelatif of ambldftrpthmedia(item)) {
      dipakaiAktif.add(pathRelatif);
    }
  }

  for (const pathRelatif of kandidat) {
    if (dipakaiAktif.has(pathRelatif)) continue;
    try {
      const pathAbs = ubhpthrltfkeabslt(pathRelatif);
      await fs.unlink(pathAbs);
    } catch {
    }
  }
}

async function btlknkalaukdlrs(jobId: string, userId: string, alasan: string): Promise<void> {
  await ubhdtbs((db) => {
    const job = db.job.find((j) => j.id === jobId && j.userId === userId);
    if (!job) return;
    if (job.status === 'success' || job.status === 'cancel') return;

    job.status = 'cancel';
    job.terakhirError = alasan;
    job.selesaiMs = skrngms();
    job.berikutnyaCobaMs = undefined;
  });

  await tmbhlog('cancel_job', { id: jobId, alasan }, userId);
}

async function cobakrmsatujobstts(
  pengirim: PengirimWhatsapp,
  jobId: string,
  userId: string,
  sedangDiproses: Set<string>,
): Promise<void> {
  const keyProses = `${userId}:${jobId}`;
  if (sedangDiproses.has(keyProses)) return;
  sedangDiproses.add(keyProses);

  const now = skrngms();

  let snapshot: JobScheduleWaStatus | null = null;

  await ubhdtbs((db) => {
    const job = db.job.find((j) => j.id === jobId && j.userId === userId);
    if (!job) return;
    if (!jobmshaktf(job)) return;
    if (!apkhjobwastts(job)) return;

    const tahap = tntknthp(job, now);
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
    await pengirim.krmsttsdarijob(snapshot);

    await ubhdtbs((db) => {
      const job = db.job.find((j) => j.id === jobId && j.userId === userId);
      if (!job) return;

      job.status = 'success';
      job.selesaiMs = skrngms();
      job.terakhirError = undefined;
      job.berikutnyaCobaMs = undefined;
    });

    await autoadptmedia(jobId, userId);
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);

    await tmbhlog('kirim_status_gagal', {
      jobId,
      error: pesan,
    }, userId).catch(() => null);

    if (apkhsssntdksnkrn(err)) {
      await tndsssntdksnkrn(userId, pesan);
    }

    await ubhdtbs((db) => {
      const job = db.job.find((j) => j.id === jobId && j.userId === userId);
      if (!job) return;
      if (!jobmshaktf(job)) return;
      if (!apkhjobwastts(job)) return;

      job.status = 'failed';
      job.terakhirError = pesan;

      const akhir = amblakhrwndwaktf(job, now);
      if (akhir) {
        const next = htngbrktnycoba(now, akhir, intervalRetryDalamWindowMs);
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

async function prssjobsndmssg(
  pengirim: Pick<PengirimWhatsapp, 'krmpsnlngsng' | 'dftrpsnprbdsjk'>,
  jobId: string,
  userId: string,
  sedangDiproses: Set<string>,
): Promise<void> {
  const keyProses = `${userId}:${jobId}`;
  if (sedangDiproses.has(keyProses)) return;
  sedangDiproses.add(keyProses);

  const now = skrngms();
  const aksiRef: { value: AksiSendMessage } = { value: { tipe: 'none' } };
  let prlubrshmedia = false;

  await ubhdtbs((db) => {
    const job = db.job.find((item) => item.id === jobId && item.userId === userId);
    if (!job) return;
    if (!jobmshaktf(job)) return;
    if (!apkhjobsndmssg(job)) return;

    if (job.status === 'queued') {
      if (now < job.targetMs) return;
      job.status = 'running';
    }

    const progress = pstknprgrsssndmssg(job);
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
        tndjobggl(job, 'Block send_message tidak valid.', now);
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
      prlubrshmedia = true;
      return;
    }

    if (block.jenis === 'delay') {
      const delayMs = ubhdrskems(block.durasi.jam, block.durasi.menit, block.durasi.detik);
      if (delayMs <= 0) {
        tndjobggl(job, 'Delay block harus lebih dari 0.', now);
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

  if (prlubrshmedia) {
    await autoadptmedia(jobId, userId);
  }

  try {
    const aksi = aksiRef.value;
    if (aksi.tipe === 'kirim') {
      await pengirim.krmpsnlngsng(aksi.opsi);

      const nowSukses = skrngms();
      let prlubrshmedia2 = false;
      await ubhdtbs((db) => {
        const job = db.job.find((item) => item.id === jobId && item.userId === userId);
        if (!job) return;
        if (!jobmshaktf(job)) return;
        if (!apkhjobsndmssg(job)) return;

        const progress = pstknprgrsssndmssg(job);
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
          prlubrshmedia2 = true;
        }
      });
      if (prlubrshmedia2) {
        await autoadptmedia(jobId, userId);
      }
      return;
    }

    if (aksi.tipe === 'cek_wait_reply') {
      const jid = ubhnmrkejid(aksi.nomorTujuan);
      const nowCek = skrngms();

      if (!jid) {
        await ubhdtbs((db) => {
          const job = db.job.find((item) => item.id === jobId && item.userId === userId);
          if (!job || !jobmshaktf(job)) return;
          tndjobggl(job, 'Nomor tujuan tidak valid.', nowCek);
        });
        return;
      }

      const daftarPesan = pengirim.dftrpsnprbdsjk(jid, aksi.wait.startedAtMs);
      const pesanCocok = daftarPesan.find((item) => cckwaitrply(item.teks, aksi.wait));

      if (pesanCocok) {
        await ubhdtbs((db) => {
          const job = db.job.find((item) => item.id === jobId && item.userId === userId);
          if (!job) return;
          if (!jobmshaktf(job)) return;
          if (!apkhjobsndmssg(job)) return;

          const progress = pstknprgrsssndmssg(job);
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
        await ubhdtbs((db) => {
          const job = db.job.find((item) => item.id === jobId && item.userId === userId);
          if (!job) return;
          if (!jobmshaktf(job)) return;
          if (!apkhjobsndmssg(job)) return;

          const progress = pstknprgrsssndmssg(job);
          progress.waitingReply = undefined;
          tndjobggl(job, 'Wait reply timeout (24h).', nowCek);
        });

        await tmbhlog('wait_reply_timeout', {
          jobId,
          nomorTujuan: aksi.nomorTujuan,
          wait: aksi.wait,
        }, userId).catch(() => null);
      }
    }
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    const nowGagal = skrngms();

    if (apkhsssntdksnkrn(err)) {
      await tndsssntdksnkrn(userId, pesan);
    }

    await ubhdtbs((db) => {
      const job = db.job.find((item) => item.id === jobId && item.userId === userId);
      if (!job) return;
      if (!jobmshaktf(job)) return;
      if (!apkhjobsndmssg(job)) return;

      const progress = pstknprgrsssndmssg(job);
      const pending = progress.pendingSend;
      if (!pending) return;

      const retry = htngrtrysndmssg(
        pending.retryCount,
        nowGagal,
        intervalRetrySendMessageMs,
        maxPercobaanKirimPesan,
      );
      if (!retry.bisaLanjut) {
        progress.pendingSend = undefined;
        tndjobggl(job, pesan, nowGagal);
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

async function prsssemuajob(
  pengirimByUser: Map<string, PengirimWhatsapp>,
  sedangDiproses: Set<string>,
): Promise<void> {
  const now = skrngms();
  const db = await bacadtbs();

  for (const job of db.job) {
    if (!jobmshaktf(job)) continue;

    const pengirim = pengirimByUser.get(job.userId);
    if (!pengirim) continue;

    if (apkhjobsndmssg(job)) {
      await prssjobsndmssg(pengirim, job.id, job.userId, sedangDiproses);
      continue;
    }

    if (!apkhjobwastts(job)) continue;

    const tahap = tntknthp(job, now);

    if (tahap === 'kadaluarsa') {
      await btlknkalaukdlrs(job.id, job.userId, 'Window pengiriman habis.');
      await autoadptmedia(job.id, job.userId);
      continue;
    }

    if (tahap === 'tunggu_10_menit') {
      if (!job.berikutnyaCobaMs || job.berikutnyaCobaMs < job.jendela.jendela2MulaiMs) {
        await ubhdtbs((db2) => {
          const j = db2.job.find((x) => x.id === job.id && x.userId === job.userId);
          if (!j) return;
          if (!jobmshaktf(j)) return;
          if (!apkhjobwastts(j)) return;
          j.berikutnyaCobaMs = j.jendela.jendela2MulaiMs;
        });
      }
      continue;
    }

    if (tahap === 'jendela_1' || tahap === 'jendela_2') {
      if (job.berikutnyaCobaMs && now < job.berikutnyaCobaMs) continue;
      await cobakrmsatujobstts(pengirim, job.id, job.userId, sedangDiproses);
      continue;
    }

  }
}

async function snkrnknpngrmwhtspp(
  pengirimByUser: Map<string, PengirimWhatsapp>,
  sedangInisialisasi: Set<string>,
): Promise<void> {
  const db = await bacadtbs();
  const daftarUserId = db.users.map((u) => u.id);

  for (const userId of daftarUserId) {
    if (pengirimByUser.has(userId)) continue;
    if (sedangInisialisasi.has(userId)) continue;

    sedangInisialisasi.add(userId);
    void smbngknwhtspp(userId)
      .then((pengirim) => {
        pengirimByUser.set(userId, pengirim);
      })
      .catch((err) => {
        void tmbhlog('wa_status', {
          status: 'menghubungkan',
          catatan: `Gagal inisialisasi socket user: ${rngkserrr(err)}`,
        }, userId).catch(() => null);
      })
      .finally(() => {
        sedangInisialisasi.delete(userId);
      });
  }
}

export async function jlnknwrkr(): Promise<void> {
  try {
    const guard = await amblgrdinstnc('worker');

    psnghndlrshtdwn(async () => {
      await guard.lepas();
    });
  } catch (err) {
    if (err instanceof InstanceLockedError) {
      await tmbhlog('instance_guard', {
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

  await snkrnknpngrmwhtspp(pengirimByUser, sedangInisialisasiUser);

  setInterval(() => {
    void snkrnknpngrmwhtspp(pengirimByUser, sedangInisialisasiUser).catch(() => null);
  }, intervalSyncPengirimMs);

  // eslint-disable-next-line no-console
  console.log('[worker] scheduler aktif');

  setInterval(() => {
    if (tickBerjalan) {
      const now = skrngms();
      if (now - terakhirLogSchedulerGuardMs >= intervalLogGuardMs) {
        terakhirLogSchedulerGuardMs = now;
        // eslint-disable-next-line no-console
        console.warn('[worker] skip tick: loop sebelumnya masih berjalan');
        void tmbhlog('scheduler_guard', {
          pesan: 'Skip tick karena proses loop sebelumnya belum selesai.',
          waktuMs: now,
        }).catch(() => null);
      }
      return;
    }

    tickBerjalan = true;
    prsssemuajob(pengirimByUser, sedangDiproses)
      .catch((err) => {
        if (err instanceof DbBusyError) {
          const now = skrngms();
          if (now - terakhirLogDbBusyMs >= intervalLogGuardMs) {
            terakhirLogDbBusyMs = now;
            void tmbhlog('db_busy', {
              proses: 'worker_loop',
              pesan: err.message,
              waktuMs: now,
            }).catch(() => null);
          }
          return;
        }

        // eslint-disable-next-line no-console
        console.error('[worker] error di loop:', rngkserrr(err));
      })
      .finally(() => {
        tickBerjalan = false;
      });
  }, intervalPollingMs);
}

if (require.main === module) {
  jlnknwrkr().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[worker] gagal start:', err);
    process.exit(1);
  });
}

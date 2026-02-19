// shared/tipe.ts
// File ini berisi tipe data (TypeScript) yang dipakai bareng oleh server & worker.

export type StatusJob = 'queued' | 'running' | 'success' | 'failed' | 'cancel';
export type JenisJob = 'wa_status' | 'send_message';

export type StatusWhatsapp = 'mati' | 'menghubungkan' | 'terhubung' | 'logout';

export type DeveloperCommand = '@private.all' | '@mypreset.1' | '@mypreset.2';

export type TipeAudience =
  | 'my_contacts'
  | 'my_contacts_excluded'
  | 'only_share_with'
  | 'developer_command';

export type TipeMedia = 'foto' | 'video';

export type SumberAkunUser = 'env' | 'register';

export type AkunUser = {
  id: string;
  name: string;
  nameLower: string;
  passwordHash: string;
  encryptor: string;
  createdAtMs: number;
  source: SumberAkunUser;
};

export type InfoMedia = {
  namaAsli: string;
  pathRelatif: string; // contoh: media/user123/abc.jpg
  mime: string;
  tipe: TipeMedia;
  ukuranByte: number;
};

export type InfoAudience = {
  tipe: TipeAudience;

  // Untuk 'my_contacts_excluded' dan 'only_share_with'
  daftarNomor?: string[]; // format: 62812xxxx (tanpa +)

  // Untuk 'developer_command'
  command?: DeveloperCommand;
};

export type DurasiKecil = {
  jam: number;
  menit: number;
  detik: number;
};

export type JendelaKirim = {
  jendela1MulaiMs: number;
  jendela1AkhirMs: number;
  jendela2MulaiMs: number;
  jendela2AkhirMs: number;
};

export type BlokSendMessageDelay = {
  id: string;
  jenis: 'delay';
  durasi: DurasiKecil;
};

export type BlokSendMessageWaitReply = {
  id: string;
  jenis: 'wait_reply';
  mode: 'any' | 'exact';
  expectedText?: string;
};

export type BlokSendMessageKirim = {
  id: string;
  jenis: 'send_message';
  pesan: string;
};

export type BlokSendMessage =
  | BlokSendMessageDelay
  | BlokSendMessageWaitReply
  | BlokSendMessageKirim;

export type SendMessagePendingSend = {
  tahap: 'initial' | 'block';
  blockIndex?: number;
  retryCount: number;
  nextRetryAtMs?: number;
  lastError?: string;
};

export type SendMessageWaitingReply = {
  mode: 'any' | 'exact';
  expectedText?: string;
  startedAtMs: number;
  timeoutAtMs: number;
  blockIndex: number;
};

export type SendMessageProgress = {
  initialSent: boolean;
  nextBlockIndex: number;
  pendingSend?: SendMessagePendingSend;
  waitingReply?: SendMessageWaitingReply;
  terakhirReplyCocokMs?: number;
};

export type InfoSendMessage = {
  nomorTujuan: string; // format: 62812xxxx (tanpa +)
  pesanAwal: string;
  media?: InfoMedia;
  blok: BlokSendMessage[];
  progress: SendMessageProgress;
};

type JobScheduleBase = {
  id: string;
  userId: string;
  dibuatPadaMs: number;
  jenis?: JenisJob;

  // Waktu target hasil dari (sekarang + durasi)
  targetMs: number;

  status: StatusJob;

  attemptCount: number;
  terakhirAttemptMs?: number;
  berikutnyaCobaMs?: number;

  terakhirError?: string;
  selesaiMs?: number;
};

export type JobScheduleWaStatus = JobScheduleBase & {
  jenis?: 'wa_status'; // undefined = kompatibilitas data lama
  jendela: JendelaKirim;
  media: InfoMedia;
  caption?: string;
  audience: InfoAudience;
  sendMessage?: undefined;
};

export type JobScheduleSendMessage = JobScheduleBase & {
  jenis: 'send_message';
  jendela?: JendelaKirim;
  media?: InfoMedia;
  caption?: string;
  audience?: InfoAudience;
  sendMessage: InfoSendMessage;
};

export type JobSchedule = JobScheduleWaStatus | JobScheduleSendMessage;

export type StatusWaDiDb = {
  status: StatusWhatsapp;
  qr: string | null;
  terakhirUpdateMs: number;
  nomor: string | null;
  catatan: string | null;
};

export type LogBaris = {
  id: string;
  waktuMs: number;
  userId?: string;
  jenis:
    | 'login_dashboard'
    | 'logout_dashboard'
    | 'register_user'
    | 'upload_media'
    | 'buat_job'
    | 'hapus_job_selesai'
    | 'cancel_job'
    | 'wa_status'
    | 'kirim_status_mulai'
    | 'kirim_status_sukses'
    | 'kirim_status_gagal'
    | 'db_busy'
    | 'instance_guard'
    | 'wa_session_desync'
    | 'scheduler_guard'
    | 'kirim_pesan_mulai'
    | 'kirim_pesan_sukses'
    | 'kirim_pesan_gagal'
    | 'wait_reply_timeout'
    | 'wa_pesan_masuk';

  // Detail bebas tapi tetap JSON
  detail: Record<string, unknown>;
};

export type StrukturDatabase = {
  versi: 2;
  users: AkunUser[];
  waByUser: Record<string, StatusWaDiDb>;
  job: JobSchedule[];
  log: LogBaris[];
};

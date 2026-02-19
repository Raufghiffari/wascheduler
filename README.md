# WA Status Scheduler (Multi Account + QR Gate)

Dashboard lokal untuk:
- login/register multi-account
- isolasi data per account (WA session, jobs, log, media)
- schedule WA Status + Send Message

## Perubahan Utama

- Multi account user agent.
- Register account baru dari halaman login (`/register`) pakai `REGISTER_ACCESS_CODE`.
- Setelah login/register, user diarahkan ke `/authorize` jika WA belum terhubung.
- QR tidak lagi ditampilkan di dashboard utama.
- Setiap account punya sesi WA sendiri:
  - `wa_auth/<userId>/...`
  - `db/wa-store/<userId>.json`
  - `media/<userId>/...`
- Worker menjaga koneksi WA untuk semua account aktif.

## Struktur Folder

- `server/`: server Express + API auth/jobs/upload
- `worker/`: scheduler + multi WA socket manager
- `db/`: data JSON + store WA per user
- `media/`: upload file media per user
- `public/`: halaman login/register/authorize/dashboard
- `wa_auth/`: auth state Baileys per user

## Env

```env
PORT=4000
DASH_USER=admin
DASH_PASS=admin123
REGISTER_ACCESS_CODE=dev-access-123
SESSION_SECRET=ganti_ini_dengan_acak_panjang
LOG_LEVEL=info
WA_AUTH_DIR=wa_auth
HAPUS_MEDIA_SETELAH_SELESAI=0
```

Catatan:
- `DASH_USER`/`DASH_PASS` tetap jadi bootstrap account.
- `REGISTER_ACCESS_CODE` wajib untuk register account baru.

## Jalankan

1. Install dependency
```bash
npm install
```

2. Build
```bash
npm run build
```

3. Dev mode
```bash
npm run dev
```

4. Buka:
- `http://localhost:4000` (atau sesuai `PORT`)

## Flow

1. Login account lama atau register account baru.
2. Jika WA account belum linked, masuk ke `/authorize` untuk scan QR.
3. Saat status WA `terhubung`, otomatis masuk dashboard.
4. Semua job/log/upload hanya untuk account yang sedang login.

## Script

- `npm run dev`: server + worker watch mode
- `npm run build`: build UI + compile TypeScript
- `npm start`: jalankan server build
- `npm run worker`: jalankan worker build
- `npm run reset`: bersihkan artefak runtime/build

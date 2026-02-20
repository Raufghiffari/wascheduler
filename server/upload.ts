
import path from 'path';
import fs from 'fs/promises';
import multer from 'multer';
import { nanoid } from 'nanoid';
import mime from 'mime-types';

const lokasiFolderMedia = path.join(process.cwd(), 'media');

const daftarMimeBoleh = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
]);

async function pstknfldrmediaada(): Promise<void> {
  await fs.mkdir(lokasiFolderMedia, { recursive: true });
}

function amblusridrqst(req: unknown): string {
  if (!req || typeof req !== 'object') return '';
  const row = req as { session?: { userId?: unknown } };
  return String(row.session?.userId || '').trim();
}

function buatnamafileunk(namaAsli: string): string {
  const ext = path.extname(namaAsli) || '';
  const id = nanoid(12);
  return `${id}${ext}`;
}

export function buatupldrmedia(): multer.Multer {
  const storage = multer.diskStorage({
    destination: async (req, _file, cb) => {
      try {
        await pstknfldrmediaada();
        const userId = amblusridrqst(req);
        if (!userId) {
          cb(new Error('Session user tidak valid.'), lokasiFolderMedia);
          return;
        }

        const folderUser = path.join(lokasiFolderMedia, userId);
        await fs.mkdir(folderUser, { recursive: true });
        cb(null, folderUser);
      } catch (err) {
        cb(err as Error, lokasiFolderMedia);
      }
    },
    filename: (_req, file, cb) => {
      cb(null, buatnamafileunk(file.originalname));
    },
  });

  const filefltr: multer.Options['fileFilter'] = (_req, file, cb) => {
    if (daftarMimeBoleh.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error(`Tipe file tidak didukung: ${file.mimetype}`));
  };

  return multer({
    storage,
    fileFilter: filefltr,
    limits: {
      fileSize: 60 * 1024 * 1024,
    },
  });
}

export function tbktipemedia(mimeType: string): 'foto' | 'video' | null {
  if (mimeType.startsWith('image/')) return 'foto';
  if (mimeType.startsWith('video/')) return 'video';
  return null;
}

export function rpknmimetyp(namaFile: string, mimetypeMasuk: string): string {
  if (mimetypeMasuk && mimetypeMasuk !== 'application/octet-stream') return mimetypeMasuk;

  const tebakan = mime.lookup(namaFile);
  if (typeof tebakan === 'string') return tebakan;

  return mimetypeMasuk || 'application/octet-stream';
}


import fs from 'fs/promises';
import path from 'path';
import lockfile from 'proper-lockfile';

export type JenisInstance = 'server' | 'worker';

export class InstanceLockedError extends Error {
  readonly code = 'INSTANCE_LOCKED';

  constructor(jenis: JenisInstance) {
    super(`Instance ${jenis} sudah berjalan.`);
    this.name = 'InstanceLockedError';
  }
}

export type InstanceGuard = {
  file: string;
  lepas: () => Promise<void>;
};

const opsiLock = {
  stale: 15_000,
  update: 5_000,
  retries: 0,
  realpath: false,
};

function nrmlsserrr(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

function ptknerrrlck(jenis: JenisInstance, err: unknown): Error {
  const e = nrmlsserrr(err);
  const kode = String((e as { code?: unknown }).code || '');
  const pesan = String(e.message || '').toLowerCase();

  if (kode === 'ELOCKED' || pesan.includes('lock file is already being held')) {
    return new InstanceLockedError(jenis);
  }

  return e;
}

async function pstknfileinstncada(file: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, '', { encoding: 'utf-8' });
  }
}

export async function amblgrdinstnc(jenis: JenisInstance): Promise<InstanceGuard> {
  const file = path.join(process.cwd(), 'db', `${jenis}.instance`);
  await pstknfileinstncada(file);

  let compromisedError: unknown = null;

  try {
    const release = await lockfile.lock(file, {
      ...opsiLock,
      onCompromised: (err: unknown) => {
        compromisedError = err;
      },
    });

    return {
      file,
      lepas: async () => {
        try {
          await release();
        } catch {
        }

        if (compromisedError) {
          compromisedError = null;
        }
      },
    };
  } catch (err) {
    throw ptknerrrlck(jenis, err);
  }
}


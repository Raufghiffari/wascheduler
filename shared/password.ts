import crypto from 'crypto';

const panjangHash = 64;
const prefix = 'scrypt';

function scryptasync(input: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(input, salt, panjangHash, (err, hasil) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(hasil as Buffer);
    });
  });
}

export function apkhfrmthshpsswrd(hash: string): boolean {
  const teks = String(hash || '');
  const parts = teks.split('$');
  return parts.length === 3 && parts[0] === prefix && parts[1].length > 0 && parts[2].length > 0;
}

export async function hshpsswrd(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptasync(password, salt);
  return `${prefix}$${salt}$${derived.toString('hex')}`;
}

export async function vrfkspsswrd(password: string, hash: string): Promise<boolean> {
  if (!apkhfrmthshpsswrd(hash)) {
    return password === hash;
  }

  const [, salt, hashHex] = hash.split('$');
  const inputHash = await scryptasync(password, salt);
  const expected = Buffer.from(hashHex, 'hex');

  if (inputHash.length !== expected.length) return false;
  return crypto.timingSafeEqual(inputHash, expected);
}

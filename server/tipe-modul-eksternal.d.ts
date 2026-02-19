// server/tipe-modul-eksternal.d.ts
// Deklarasi minimal untuk modul eksternal yang belum punya tipe bawaan.

declare module 'proper-lockfile' {
  export type RetryOptions = {
    retries?: number;
    minTimeout?: number;
    maxTimeout?: number;
  };

  export type LockOptions = {
    stale?: number;
    update?: number;
    retries?: number | RetryOptions;
    realpath?: boolean;
    onCompromised?: (err: unknown) => void;
    lockfilePath?: string;
  };

  export type ReleaseFn = () => Promise<void>;

  const lockfile: {
    lock: (file: string, options?: LockOptions) => Promise<ReleaseFn>;
    unlock: (file: string, options?: Record<string, unknown>) => Promise<void>;
    check: (file: string, options?: Record<string, unknown>) => Promise<boolean>;
  };

  export default lockfile;
}

declare module 'qrcode' {
  export type ToDataURLOptions = {
    margin?: number;
    width?: number;
  };

  const QRCode: {
    toDataURL: (teks: string, opsi?: ToDataURLOptions) => Promise<string>;
  };

  export default QRCode;
}


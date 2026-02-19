// server/halaman.ts
// Modul kecil untuk mengirim file HTML dashboard.

import path from 'path';
import type { Response } from 'express';

// Fungsi ini menghitung path absolut untuk file di folder public/.
export function ambilPathPublic(relatif: string): string {
  return path.join(process.cwd(), 'public', relatif);
}

// Fungsi ini mengirim halaman login.
export function kirimHalamanLogin(res: Response): void {
  res.sendFile(ambilPathPublic('login.html'));
}

// Fungsi ini mengirim halaman register.
export function kirimHalamanRegister(res: Response): void {
  res.sendFile(ambilPathPublic('register.html'));
}

// Fungsi ini mengirim halaman authorize.
export function kirimHalamanAuthorize(res: Response): void {
  res.sendFile(ambilPathPublic('authorize.html'));
}

// Fungsi ini mengirim halaman dashboard.
export function kirimHalamanDashboard(res: Response): void {
  res.sendFile(ambilPathPublic('dashboard.html'));
}

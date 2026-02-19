// server/auth.ts
// Modul auth berbasis session cookie + akun multi-user.

import type { AkunUser, StatusWaDiDb } from '../shared/tipe';
import type { Request, Response, NextFunction } from 'express';
import { bacaDatabase, tambahLog, buatStatusWaAwal } from '../db/penyimpanan';
import { verifikasiPassword } from '../shared/password';

export type InfoSessionUser = {
  userId: string;
  username: string;
};

export function ambilAccessCodeRegister(): string {
  return String(process.env.REGISTER_ACCESS_CODE || 'developer-access');
}

export function ambilUserSession(req: Request): InfoSessionUser | null {
  const userId = String(req.session?.userId || '').trim();
  const username = String(req.session?.username || '').trim();
  if (!userId || !username) return null;
  return { userId, username };
}

export async function cariUserByUsername(username: string): Promise<AkunUser | null> {
  const nameLower = String(username || '').trim().toLowerCase();
  if (!nameLower) return null;

  const db = await bacaDatabase();
  return db.users.find((user) => user.nameLower === nameLower) || null;
}

export async function autentikasiUser(username: string, password: string): Promise<AkunUser | null> {
  const user = await cariUserByUsername(username);
  if (!user) return null;

  const cocok = await verifikasiPassword(password, user.passwordHash);
  return cocok ? user : null;
}

// Fungsi ini mengecek apakah request sudah login (session).
export function sudahLogin(req: Request): boolean {
  return Boolean(ambilUserSession(req));
}

// Fungsi ini middleware untuk halaman/API yang wajib login.
export function butuhLogin(req: Request, res: Response, next: NextFunction): void {
  if (sudahLogin(req)) {
    next();
    return;
  }

  // Untuk API, balas JSON biar UI bisa nangkep.
  const adalahApi = req.originalUrl.startsWith('/api/') || req.baseUrl.startsWith('/api');
  if (adalahApi) {
    res.status(401).json({ ok: false, pesan: 'Belum login.' });
    return;
  }

  // Untuk halaman biasa, redirect ke login.
  res.redirect('/');
}

export async function ambilStatusWaUser(userId: string): Promise<StatusWaDiDb> {
  const db = await bacaDatabase();
  return db.waByUser[userId] || buatStatusWaAwal();
}

export async function tentukanRuteSetelahLogin(userId: string): Promise<'/authorize' | '/dashboard'> {
  const wa = await ambilStatusWaUser(userId);
  return wa.status === 'terhubung' ? '/dashboard' : '/authorize';
}

export async function tentukanRuteDariSession(req: Request): Promise<'/login' | '/authorize' | '/dashboard'> {
  const sessionUser = ambilUserSession(req);
  if (!sessionUser) return '/login';
  return tentukanRuteSetelahLogin(sessionUser.userId);
}

// Fungsi ini menandai session sebagai login dan menulis log.
export async function tandaiLogin(req: Request, user: { id: string; name: string }): Promise<void> {
  req.session.sudahLogin = true;
  req.session.userId = user.id;
  req.session.username = user.name;
  await tambahLog('login_dashboard', { username: user.name }, user.id);
}

// Fungsi ini menghapus session login dan menulis log.
export async function tandaiLogout(req: Request): Promise<void> {
  const userId = String(req.session?.userId || '').trim();
  req.session.sudahLogin = false;
  req.session.userId = undefined;
  req.session.username = undefined;
  await tambahLog('logout_dashboard', {}, userId || undefined);
}

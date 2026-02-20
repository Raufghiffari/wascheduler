
import type { AkunUser, StatusWaDiDb } from '../shared/tipe';
import type { Request, Response, NextFunction } from 'express';
import { bacadtbs, tmbhlog, buatsttswaawl } from '../db/penyimpanan';
import { vrfkspsswrd } from '../shared/password';

export type InfoSessionUser = {
  userId: string;
  username: string;
};

export function amblaccsscodergstr(): string {
  return String(process.env.REGISTER_ACCESS_CODE || 'developer-access');
}

export function amblusrsssn(req: Request): InfoSessionUser | null {
  const userId = String(req.session?.userId || '').trim();
  const username = String(req.session?.username || '').trim();
  if (!userId || !username) return null;
  return { userId, username };
}

export async function cariusrbyusrnm(username: string): Promise<AkunUser | null> {
  const nameLower = String(username || '').trim().toLowerCase();
  if (!nameLower) return null;

  const db = await bacadtbs();
  return db.users.find((user) => user.nameLower === nameLower) || null;
}

export async function atntksusr(username: string, password: string): Promise<AkunUser | null> {
  const user = await cariusrbyusrnm(username);
  if (!user) return null;

  const cocok = await vrfkspsswrd(password, user.passwordHash);
  return cocok ? user : null;
}

export function sdhlgn(req: Request): boolean {
  return Boolean(amblusrsssn(req));
}

export function bthlgn(req: Request, res: Response, next: NextFunction): void {
  if (sdhlgn(req)) {
    next();
    return;
  }

  const adalahApi = req.originalUrl.startsWith('/api/') || req.baseUrl.startsWith('/api');
  if (adalahApi) {
    res.status(401).json({ ok: false, pesan: 'Belum login.' });
    return;
  }

  res.redirect('/');
}

export async function amblsttswausr(userId: string): Promise<StatusWaDiDb> {
  const db = await bacadtbs();
  return db.waByUser[userId] || buatsttswaawl();
}

export async function tntknrutestlhlgn(userId: string): Promise<'/authorize' | '/dashboard'> {
  const wa = await amblsttswausr(userId);
  return wa.status === 'terhubung' ? '/dashboard' : '/authorize';
}

export async function tntknrutedarisssn(req: Request): Promise<'/login' | '/authorize' | '/dashboard'> {
  const sessionUser = amblusrsssn(req);
  if (!sessionUser) return '/login';
  return tntknrutestlhlgn(sessionUser.userId);
}

export async function tndlgn(req: Request, user: { id: string; name: string }): Promise<void> {
  req.session.sdhlgn = true;
  req.session.userId = user.id;
  req.session.username = user.name;
  await tmbhlog('login_dashboard', { username: user.name }, user.id);
}

export async function tndlgt(req: Request): Promise<void> {
  const userId = String(req.session?.userId || '').trim();
  req.session.sdhlgn = false;
  req.session.userId = undefined;
  req.session.username = undefined;
  await tmbhlog('logout_dashboard', {}, userId || undefined);
}

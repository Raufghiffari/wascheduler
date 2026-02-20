
import path from 'path';
import type { Response } from 'express';

export function amblpthpblc(relatif: string): string {
  return path.join(process.cwd(), 'public', relatif);
}

export function krmhlmnlgn(res: Response): void {
  res.sendFile(amblpthpblc('login.html'));
}

export function krmhlmnrgstr(res: Response): void {
  res.sendFile(amblpthpblc('register.html'));
}

export function krmhlmnathrz(res: Response): void {
  res.sendFile(amblpthpblc('authorize.html'));
}

export function krmhlmndshbrd(res: Response): void {
  res.sendFile(amblpthpblc('dashboard.html'));
}

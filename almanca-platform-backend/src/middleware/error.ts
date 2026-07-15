import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Bulunamadı' });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Doğrulama hatası', details: err.flatten().fieldErrors });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // Prisma "unique constraint" gibi bilinen hatalar için basit kontrol
  if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
    res.status(409).json({ error: 'Bu kayıt zaten mevcut' });
    return;
  }
  console.error('Beklenmeyen hata:', err);
  res.status(500).json({ error: 'Sunucu hatası' });
}

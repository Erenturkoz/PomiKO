import { NextFunction, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { AppError } from '../lib/errors';

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(401, 'Önce giriş yapmalısınız');
    }
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, 'Bu işlem için yetkiniz yok');
    }
    next();
  };
}

// Jeton kapsamı: 'account' (veli tam yetki) veya 'profile' (çocuğa kilitli)
export function requireScope(scope: 'account' | 'profile') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(401, 'Önce giriş yapmalısınız');
    }
    if (req.user.scope !== scope) {
      if (scope === 'account') {
        throw new AppError(403, 'Bu işlem için hesap moduna geçmelisin (PIN gerekli)');
      }
      throw new AppError(403, 'Bu işlem için bir çocuk profili seçmelisin');
    }
    if (scope === 'profile' && !req.user.childId) {
      throw new AppError(403, 'Aktif çocuk profili bulunamadı');
    }
    next();
  };
}

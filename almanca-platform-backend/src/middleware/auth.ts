import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { AppError } from '../lib/errors';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError(401, 'Yetkilendirme token\'ı gerekli');
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      role: payload.role,
      scope: payload.scope ?? 'account',
      childId: payload.childId,
    };
    next();
  } catch {
    throw new AppError(401, 'Geçersiz veya süresi dolmuş token');
  }
}

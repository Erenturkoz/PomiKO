import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/errors';
import { authenticate } from '../../middleware/auth';
import { requireScope } from '../../middleware/roles';
import * as authService from './auth.service';
import { logEvent } from '../../lib/eventlog';
import { env } from '../../config/env';

const router = Router();

const REFRESH_COOKIE = 'refreshToken';

function setRefreshCookie(res: import('express').Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: false, // lokal geliştirme; production'da true
    sameSite: 'lax',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

const childSchema = z.object({
  name: z.string().min(2, 'Çocuk adı en az 2 karakter olmalı'),
  age: z.number().int().min(3).max(18),
  birthDate: z.string().datetime().optional(),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Parola en az 8 karakter olmalı'),
  name: z.string().min(2),
  pin: z.string().regex(/^\d{4}$/, 'PIN 4 haneli rakam olmalı'),
  kvkkConsent: z.boolean().refine((v) => v === true, { message: 'KVKK onayı gerekli' }),
  children: z
    .array(childSchema)
    .min(1, 'En az bir çocuk profili ekle')
    .max(2, 'En fazla 2 çocuk ekleyebilirsin; daha fazlası için bizimle iletişime geç'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Veli kaydı (öğretmen/admin buradan kayıt OLAMAZ)
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const result = await authService.registerParent(data);
    logEvent({
      type: 'auth.register',
      userId: result.user.id,
      actorName: result.user.name,
      role: result.user.role,
      meta: { children: data.children.length },
    });
    setRefreshCookie(res, result.refreshToken);
    res.status(201).json({ user: result.user, accessToken: result.accessToken, session: result.session });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data);
    logEvent({
      type: 'auth.login',
      userId: result.user.id,
      actorName: result.user.name,
      role: result.user.role,
    });
    setRefreshCookie(res, result.refreshToken);
    res.json({ user: result.user, accessToken: result.accessToken, session: result.session });
  })
);

// Access token süresi dolunca yeni token almak için (refresh kaydındaki modu korur)
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    const result = await authService.rotateRefresh(token);
    setRefreshCookie(res, result.refreshToken);
    res.json({ user: result.user, accessToken: result.accessToken, session: result.session });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    await authService.logout(token);
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    res.json({ ok: true });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await authService.getMe(req.user!.id);
    res.json({ user });
  })
);

// Oturum durumu: mod (account/profile) + aktif çocuk
router.get(
  '/session',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await authService.getSession(req.user!.id, req.user!.scope, req.user!.childId);
    res.json(result);
  })
);

const selectSchema = z.object({ childId: z.string().min(1) });

// Çocuk profili seç (yalnızca hesap modundan) → profil jetonu döner
router.post(
  '/profile/select',
  authenticate,
  requireScope('account'),
  asyncHandler(async (req, res) => {
    const { childId } = selectSchema.parse(req.body);
    const token = req.cookies?.[REFRESH_COOKIE];
    const result = await authService.selectProfile(token, req.user!.id, childId);
    logEvent({
      type: 'profile.select',
      userId: req.user!.id,
      childProfileId: childId,
      actorName: result.session.child?.name ?? null,
      role: 'PARENT',
    });
    res.json({ accessToken: result.accessToken, session: result.session });
  })
);

const unlockSchema = z.object({ pin: z.string().min(1) });

// Hesap moduna dön (PIN ile) → hesap jetonu döner
router.post(
  '/profile/unlock',
  authenticate,
  asyncHandler(async (req, res) => {
    const { pin } = unlockSchema.parse(req.body);
    const token = req.cookies?.[REFRESH_COOKIE];
    try {
      const result = await authService.unlockAccount(token, req.user!.id, pin);
      logEvent({ type: 'profile.unlock_ok', userId: req.user!.id, role: 'PARENT' });
      res.json({ accessToken: result.accessToken, session: result.session });
    } catch (err) {
      logEvent({ type: 'profile.unlock_fail', userId: req.user!.id, role: 'PARENT' });
      throw err;
    }
  })
);

export default router;

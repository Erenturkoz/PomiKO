import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler, AppError } from '../../lib/errors';
import { authenticate } from '../../middleware/auth';
import { requireRole, requireScope } from '../../middleware/roles';
import { logEvent } from '../../lib/eventlog';

const router = Router();

// Tüm uçlar: giriş + PARENT rolü + HESAP modu (profil modundan erişilemez)
router.use(authenticate, requireRole(Role.PARENT), requireScope('account'));

const CONSENT_VERSION = 'kvkk-2026-01';

// Velinin sahip olduğu çocuğu getir (yetki kontrolüyle)
async function ownedChild(childId: string, parentUserId: string) {
  const child = await prisma.childProfile.findUnique({ where: { id: childId } });
  if (!child || child.parentUserId !== parentUserId) {
    throw new AppError(404, 'Çocuk profili bulunamadı');
  }
  return child;
}

const createChildSchema = z.object({
  name: z.string().min(2),
  age: z.number().int().min(3).max(18),
  birthDate: z.string().datetime().optional(),
});

// Çocuk (alt) profili oluştur — KVKK onayı otomatik kaydedilir (veli hesap açarken onayladı)
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createChildSchema.parse(req.body);

    // Sınır: en fazla 2 çocuk. Daha fazlası için yönetimle iletişim gerekir.
    const count = await prisma.childProfile.count({ where: { parentUserId: req.user!.id } });
    if (count >= 2) {
      throw new AppError(403, 'En fazla 2 çocuk profili. Daha fazlası için bizimle iletişime geç.');
    }

    const child = await prisma.$transaction(async (tx) => {
      const c = await tx.childProfile.create({
        data: {
          parentUserId: req.user!.id,
          name: data.name,
          age: data.age,
          birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        },
      });
      await tx.consent.create({
        data: { parentUserId: req.user!.id, childProfileId: c.id, consentVersion: CONSENT_VERSION },
      });
      return c;
    });
    res.status(201).json({ child });
  })
);

// Velinin çocuk profillerini listele (kredi + onay durumuyla)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const children = await prisma.childProfile.findMany({
      where: { parentUserId: req.user!.id },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { consents: true } } },
    });
    // Çocuk başına toplam yıldız (bookinglerdeki stars toplamı)
    const starSums = await prisma.booking.groupBy({
      by: ['childProfileId'],
      where: { childProfileId: { in: children.map((c) => c.id) } },
      _sum: { stars: true },
    });
    const starsByChild = new Map(starSums.map((s) => [s.childProfileId, s._sum.stars ?? 0]));
    const result = children.map((c) => ({
      id: c.id,
      name: c.name,
      age: c.age,
      birthDate: c.birthDate,
      level: c.level,
      credits: c.credits,
      totalStars: starsByChild.get(c.id) ?? 0,
      createdAt: c.createdAt,
      hasConsent: c._count.consents > 0,
    }));
    res.json({ children: result });
  })
);

const topupSchema = z.object({
  amount: z.number().int().min(1).max(100),
});

// Kredi yükle (ŞİMDİLİK SAHTE — ödeme altyapısı yok; doğrudan bakiyeyi artırır)
router.post(
  '/:childId/credits',
  asyncHandler(async (req, res) => {
    const { amount } = topupSchema.parse(req.body);
    const child = await ownedChild(req.params.childId, req.user!.id);

    const updated = await prisma.$transaction(async (tx) => {
      const c = await tx.childProfile.update({
        where: { id: child.id },
        data: { credits: { increment: amount } },
      });
      await tx.creditEntry.create({
        data: {
          childProfileId: c.id,
          delta: amount,
          reason: 'topup',
          balanceAfter: c.credits,
        },
      });
      return c;
    });
    logEvent({
      type: 'credit.topup',
      userId: req.user!.id,
      childProfileId: child.id,
      actorName: child.name,
      role: 'PARENT',
      meta: { amount, balanceAfter: updated.credits },
    });

    res.json({ credits: updated.credits });
  })
);

// Kredi bakiyesi + son hareketler
router.get(
  '/:childId/credits',
  asyncHandler(async (req, res) => {
    const child = await ownedChild(req.params.childId, req.user!.id);
    const entries = await prisma.creditEntry.findMany({
      where: { childProfileId: child.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ credits: child.credits, entries });
  })
);

const consentSchema = z.object({
  consentVersion: z.string().min(1),
});

// Geriye dönük uyumluluk: elle KVKK onayı
router.post(
  '/:childId/consent',
  asyncHandler(async (req, res) => {
    const data = consentSchema.parse(req.body);
    const child = await ownedChild(req.params.childId, req.user!.id);
    const consent = await prisma.consent.create({
      data: {
        parentUserId: req.user!.id,
        childProfileId: child.id,
        consentVersion: data.consentVersion,
        ip: req.ip,
      },
    });
    res.status(201).json({ consent });
  })
);

export default router;

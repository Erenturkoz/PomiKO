import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/errors';

const router = Router();

// Sunucu saati — tüm geri sayımların tek doğru kaynağı.
// Tarayıcı saati yanlış/kurcalanmış olabilir; istemci bu değerle kendini hizalar.
router.get(
  '/time',
  asyncHandler(async (_req, res) => {
    res.json({ now: new Date().toISOString() });
  })
);

// Ana sayfa içeriği — herkese açık (giriş gerekmez).
// İçerik blokları admin panelinden düzenlenir; boşsa frontend kendi varsayılanını kullanır.
router.get(
  '/home',
  asyncHandler(async (_req, res) => {
    const [blocks, teachers, testimonials] = await Promise.all([
      prisma.siteContent.findMany(),
      prisma.teacherProfile.findMany({
        where: { showOnHome: true },
        orderBy: { sortOrder: 'asc' },
        include: { user: { select: { name: true } } },
      }),
      prisma.testimonial.findMany({
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    const content: Record<string, unknown> = {};
    for (const b of blocks) content[b.key] = b.value;

    res.json({
      content,
      teachers: teachers.map((t) => ({
        id: t.id,
        name: t.user.name,
        headline: t.headline,
        bio: t.bio,
        photoUrl: t.photoUrl,
      })),
      testimonials: testimonials.map((t) => ({
        id: t.id,
        name: t.name,
        role: t.role,
        text: t.text,
        rating: t.rating,
      })),
    });
  })
);

export default router;

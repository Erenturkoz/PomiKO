import { Router } from 'express';
import { z } from 'zod';
import { Role, SlotStatus, BookingStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler, AppError } from '../../lib/errors';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';

const router = Router();

// Tüm uçlar: giriş + TEACHER rolü
router.use(authenticate, requireRole(Role.TEACHER));

async function getTeacherProfileId(userId: string): Promise<string> {
  const tp = await prisma.teacherProfile.findUnique({ where: { userId } });
  if (!tp) throw new AppError(404, 'Öğretmen profili bulunamadı');
  return tp.id;
}

const createSlotSchema = z.object({
  startTime: z.string().datetime(), // ISO
  durationMinutes: z.number().int().min(15).max(180).default(30),
});

// Müsait ders saati aç
router.post(
  '/slots',
  asyncHandler(async (req, res) => {
    const data = createSlotSchema.parse(req.body);
    const teacherId = await getTeacherProfileId(req.user!.id);

    const start = new Date(data.startTime);
    const end = new Date(start.getTime() + data.durationMinutes * 60_000);
    if (start <= new Date()) {
      throw new AppError(400, 'Geçmiş bir saat için ders saati açamazsın');
    }

    // Aynı öğretmende çakışan saat var mı?
    const overlap = await prisma.availabilitySlot.findFirst({
      where: {
        teacherId,
        status: { not: SlotStatus.CANCELLED },
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });
    if (overlap) {
      throw new AppError(409, 'Bu saat mevcut bir ders saatinle çakışıyor');
    }

    const slot = await prisma.availabilitySlot.create({
      data: { teacherId, startTime: start, endTime: end },
    });
    res.status(201).json({ slot });
  })
);

// Kendi ders saatlerini listele (rezerve edilmişse öğrenci bilgisiyle)
router.get(
  '/slots',
  asyncHandler(async (req, res) => {
    const teacherId = await getTeacherProfileId(req.user!.id);
    const slots = await prisma.availabilitySlot.findMany({
      where: { teacherId },
      orderBy: { startTime: 'asc' },
      include: {
        booking: {
          include: {
            topic: { select: { name: true } },
            child: {
              select: { id: true, name: true, parent: { select: { name: true } } },
            },
          },
        },
      },
    });
    res.json({ slots });
  })
);

// Açık (rezerve edilmemiş) bir saati sil
router.delete(
  '/slots/:id',
  asyncHandler(async (req, res) => {
    const teacherId = await getTeacherProfileId(req.user!.id);
    const slot = await prisma.availabilitySlot.findUnique({
      where: { id: req.params.id },
      include: { booking: true },
    });
    if (!slot || slot.teacherId !== teacherId) {
      throw new AppError(404, 'Ders saati bulunamadı');
    }
    if (slot.booking && slot.booking.status !== BookingStatus.CANCELLED) {
      throw new AppError(409, 'Rezerve edilmiş saat silinemez');
    }
    await prisma.availabilitySlot.delete({ where: { id: slot.id } });
    res.json({ ok: true });
  })
);

// Yaklaşan dersler (rezerve edilmiş saatler)
router.get(
  '/bookings',
  asyncHandler(async (req, res) => {
    const teacherId = await getTeacherProfileId(req.user!.id);
    const bookings = await prisma.booking.findMany({
      where: { teacherId, status: { not: BookingStatus.CANCELLED } },
      orderBy: { slot: { startTime: 'asc' } },
      include: {
        slot: true,
        child: { select: { id: true, name: true, parent: { select: { name: true } } } },
      },
    });
    res.json({ bookings });
  })
);

export default router;

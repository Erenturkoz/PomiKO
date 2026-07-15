import { Router } from 'express';
import { z } from 'zod';
import { Role, SlotStatus, BookingStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler, AppError } from '../../lib/errors';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';
import { hashPassword, verifyPassword } from '../../lib/password';
import { loginLimiter } from '../../middleware/rateLimit';

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
      // CANCELLED slotlar iptal tarihçesidir; takvimde gösterilmez
      // (aynı saatte yeni OPEN slot varken çakışma yaratmasın)
      where: { teacherId, status: { not: SlotStatus.CANCELLED } },
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

// ============================================================
// ÖĞRETMEN AYARLARI — kendi bilgilerini görüntüleme/güncelleme
// Vitrin alanları (ünvan, fotoğraf, ana sayfa görünürlüğü) admin'dedir.
// ============================================================

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        name: true,
        email: true,
        teacherProfile: {
          select: {
            bio: true,
            phone: true,
            birthDate: true,
            education: true,
            experienceYears: true,
            specialties: true,
            iban: true,
            startDate: true,
          },
        },
      },
    });
    if (!user?.teacherProfile) throw new AppError(404, 'Öğretmen profili bulunamadı');
    res.json({ me: { name: user.name, email: user.email, ...user.teacherProfile } });
  })
);

const meSchema = z.object({
  bio: z.string().max(600).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  birthDate: z.string().datetime().optional().nullable(),
  education: z.string().max(300).optional().nullable(),
  experienceYears: z.number().int().min(0).max(60).optional().nullable(),
  specialties: z.string().max(400).optional().nullable(),
  iban: z.string().max(40).optional().nullable(),
});

router.put(
  '/me',
  asyncHandler(async (req, res) => {
    const data = meSchema.parse(req.body);
    const tpId = await getTeacherProfileId(req.user!.id);
    await prisma.teacherProfile.update({
      where: { id: tpId },
      data: {
        bio: data.bio ?? undefined,
        phone: data.phone ?? undefined,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        education: data.education ?? undefined,
        experienceYears: data.experienceYears ?? undefined,
        specialties: data.specialties ?? undefined,
        iban: data.iban ?? undefined,
      },
    });
    res.json({ ok: true });
  })
);

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, 'Yeni parola en az 8 karakter olmalı')
    .max(128)
    .refine((v) => !/^\d+$/.test(v), 'Parola yalnızca rakamlardan oluşamaz'),
});

// Parola değişimi: mevcut parola doğrulanır; admin'in sakladığı geçici parola silinir
router.post(
  '/me/password',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = passwordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AppError(401, 'Mevcut parola hatalı');
    }
    const tpId = await getTeacherProfileId(req.user!.id);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(newPassword) },
      }),
      // Güvenlik: düz saklanan geçici parola artık geçersiz — sil
      prisma.teacherProfile.update({ where: { id: tpId }, data: { initialPassword: null } }),
    ]);
    res.json({ ok: true });
  })
);

export default router;

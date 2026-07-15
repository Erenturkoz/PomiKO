import { Router } from 'express';
import { z } from 'zod';
import { Role, SlotStatus, BookingStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler, AppError } from '../../lib/errors';
import { authenticate } from '../../middleware/auth';
import { requireRole, requireScope } from '../../middleware/roles';
import { logEvent } from '../../lib/eventlog';

const router = Router();

// Tüm uçlar: giriş + PARENT rolü + PROFİL modu (aktif çocuk jetonda)
router.use(authenticate, requireRole(Role.PARENT), requireScope('profile'));

// Aktif çocuğun bilgisi + kredisi (panel başlığı için)
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const child = await prisma.childProfile.findUnique({
      where: { id: req.user!.childId! },
      select: { id: true, name: true, age: true, credits: true },
    });
    if (!child) throw new AppError(404, 'Profil bulunamadı');
    res.json({ child });
  })
);

// Rezervasyon için açık (boş, gelecekteki) ders saatleri
router.get(
  '/slots/open',
  asyncHandler(async (_req, res) => {
    const slots = await prisma.availabilitySlot.findMany({
      where: { status: SlotStatus.OPEN, startTime: { gt: new Date() } },
      orderBy: { startTime: 'asc' },
      include: { teacher: { include: { user: { select: { name: true } } } } },
    });
    res.json({ slots });
  })
);

// Aktif ders konuları
router.get(
  '/topics',
  asyncHandler(async (_req, res) => {
    const topics = await prisma.topic.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, description: true },
    });
    res.json({ topics });
  })
);

const createBookingSchema = z.object({
  slotId: z.string().min(1),
  topicId: z.string().min(1),
});

// Ders rezerve et — çocuk jetondan gelir; 1 kredi düşülür (atomik)
router.post(
  '/bookings',
  asyncHandler(async (req, res) => {
    const data = createBookingSchema.parse(req.body);
    const childId = req.user!.childId!;

    const child = await prisma.childProfile.findUnique({ where: { id: childId } });
    if (!child) throw new AppError(404, 'Çocuk profili bulunamadı');

    const consent = await prisma.consent.findFirst({ where: { childProfileId: child.id } });
    if (!consent) throw new AppError(400, 'KVKK onayı gerekli');

    const topic = await prisma.topic.findUnique({ where: { id: data.topicId } });
    if (!topic || !topic.active) throw new AppError(400, 'Geçerli bir ders konusu seç');

    const slot = await prisma.availabilitySlot.findUnique({ where: { id: data.slotId } });
    if (!slot) throw new AppError(404, 'Ders saati bulunamadı');
    if (slot.startTime <= new Date()) {
      throw new AppError(400, 'Geçmiş bir ders saati rezerve edilemez');
    }

    const booking = await prisma.$transaction(async (tx) => {
      // Krediyi atomik düş
      const deduct = await tx.childProfile.updateMany({
        where: { id: child.id, credits: { gte: 1 } },
        data: { credits: { decrement: 1 } },
      });
      if (deduct.count === 0) {
        throw new AppError(400, 'Yetersiz kredi. Önce kredi yükleyin.');
      }

      const updated = await tx.availabilitySlot.updateMany({
        where: { id: slot.id, status: SlotStatus.OPEN },
        data: { status: SlotStatus.BOOKED },
      });
      if (updated.count === 0) {
        throw new AppError(409, 'Bu ders saati az önce dolmuş');
      }

      const created = await tx.booking.create({
        data: {
          slotId: slot.id,
          childProfileId: child.id,
          teacherId: slot.teacherId,
          topicId: topic.id,
          roomName: `lesson-${slot.id}`,
        },
      });

      const after = await tx.childProfile.findUnique({
        where: { id: child.id },
        select: { credits: true },
      });
      await tx.creditEntry.create({
        data: {
          childProfileId: child.id,
          delta: -1,
          reason: 'booking',
          balanceAfter: after!.credits,
          bookingId: created.id,
        },
      });
      return created;
    });

    logEvent({
      type: 'booking.create',
      bookingId: booking.id,
      userId: req.user!.id,
      childProfileId: child.id,
      actorName: child.name,
      role: 'PARENT',
      meta: { topic: topic.name, startsAt: slot.startTime.toISOString() },
    });

    res.status(201).json({ booking });
  })
);

// Aktif çocuğun rezervasyonları
router.get(
  '/bookings',
  asyncHandler(async (req, res) => {
    const bookings = await prisma.booking.findMany({
      where: { childProfileId: req.user!.childId! },
      orderBy: { slot: { startTime: 'asc' } },
      include: {
        slot: true,
        child: { select: { id: true, name: true } },
        teacher: { include: { user: { select: { name: true } } } },
        topic: { select: { name: true } },
      },
    });
    res.json({ bookings });
  })
);

// Rezervasyon iptal (30 dk kuralı + kredi iadesi) — yalnızca aktif çocuğun dersi
router.post(
  '/bookings/:id/cancel',
  asyncHandler(async (req, res) => {
    const childId = req.user!.childId!;
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: { slot: true },
    });
    if (!booking || booking.childProfileId !== childId) {
      throw new AppError(404, 'Rezervasyon bulunamadı');
    }
    if (booking.status === BookingStatus.CANCELLED) {
      throw new AppError(400, 'Bu rezervasyon zaten iptal edilmiş');
    }

    const cutoff = new Date(booking.slot.startTime.getTime() - 30 * 60 * 1000);
    if (new Date() >= cutoff) {
      throw new AppError(400, 'Ders başlangıcına 30 dakikadan az kaldığı için iptal edilemez');
    }

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.CANCELLED },
      });
      // Eski slotu OPEN'a döndürmÜYORUZ: rezervasyon kaydı slota benzersiz bağlı
      // olduğu için başka bir öğrenci aynı slotu bir daha alamazdı ("kayıt zaten
      // mevcut" hatasının sebebi buydu). Bunun yerine eski slot iptal tarihçesi
      // olarak kalır, aynı saat için YENİ ve temiz bir OPEN slot oluşturulur.
      await tx.availabilitySlot.update({
        where: { id: booking.slotId },
        data: { status: SlotStatus.CANCELLED },
      });
      await tx.availabilitySlot.create({
        data: {
          teacherId: booking.teacherId,
          startTime: booking.slot.startTime,
          endTime: booking.slot.endTime,
          status: SlotStatus.OPEN,
        },
      });
      const c = await tx.childProfile.update({
        where: { id: booking.childProfileId },
        data: { credits: { increment: 1 } },
      });
      await tx.creditEntry.create({
        data: {
          childProfileId: booking.childProfileId,
          delta: 1,
          reason: 'refund',
          balanceAfter: c.credits,
          bookingId: booking.id,
        },
      });
    });

    logEvent({
      type: 'booking.cancel',
      bookingId: booking.id,
      userId: req.user!.id,
      childProfileId: childId,
      role: 'PARENT',
      meta: { refunded: 1, startsAt: booking.slot.startTime.toISOString() },
    });

    res.json({ ok: true });
  })
);

export default router;

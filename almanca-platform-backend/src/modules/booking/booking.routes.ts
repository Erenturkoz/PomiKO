import { Router } from 'express';
import { z } from 'zod';
import { Role, SlotStatus, BookingStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler, AppError } from '../../lib/errors';
import { authenticate } from '../../middleware/auth';
import { requireRole, requireScope } from '../../middleware/roles';
import { logEvent } from '../../lib/eventlog';
import { getMaterialStates, healCompletedBookings } from '../progress/progress.service';

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

// Rezervasyon için öğretmen listesi: foto, isim, tanıtım + o an açık (gelecekteki) saat sayısı
// + aktif çocuğun bu öğretmeni favorileyip favorilemediği.
// Öğrenci akışı önce öğretmen seçer, bu yüzden showOnHome filtresi yok — burada tüm öğretmenler görünür.
router.get(
  '/teachers',
  asyncHandler(async (req, res) => {
    const childId = req.user!.childId!;
    const [teachers, slotCounts, favorites] = await Promise.all([
      prisma.teacherProfile.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { user: { select: { name: true } } },
      }),
      prisma.availabilitySlot.groupBy({
        by: ['teacherId'],
        where: { status: SlotStatus.OPEN, startTime: { gt: new Date() } },
        _count: { _all: true },
      }),
      prisma.teacherFavorite.findMany({
        where: { childProfileId: childId },
        select: { teacherId: true },
      }),
    ]);
    const countByTeacher = new Map(slotCounts.map((s) => [s.teacherId, s._count._all]));
    const favoriteSet = new Set(favorites.map((f) => f.teacherId));
    res.json({
      teachers: teachers.map((t) => ({
        id: t.id,
        name: t.user.name,
        headline: t.headline,
        bio: t.bio,
        photoUrl: t.photoUrl,
        openSlotCount: countByTeacher.get(t.id) ?? 0,
        isFavorite: favoriteSet.has(t.id),
      })),
    });
  })
);

// Öğretmeni favorile / favoriden çıkar (aktif çocuk için)
router.post(
  '/teachers/:id/favorite',
  asyncHandler(async (req, res) => {
    const childId = req.user!.childId!;
    const teacherId = req.params.id;
    const teacher = await prisma.teacherProfile.findUnique({ where: { id: teacherId } });
    if (!teacher) throw new AppError(404, 'Öğretmen bulunamadı');
    await prisma.teacherFavorite.upsert({
      where: { childProfileId_teacherId: { childProfileId: childId, teacherId } },
      update: {},
      create: { childProfileId: childId, teacherId },
    });
    res.status(201).json({ ok: true });
  })
);

router.delete(
  '/teachers/:id/favorite',
  asyncHandler(async (req, res) => {
    const childId = req.user!.childId!;
    const teacherId = req.params.id;
    await prisma.teacherFavorite.deleteMany({ where: { childProfileId: childId, teacherId } });
    res.json({ ok: true });
  })
);

// Rezervasyon için açık (boş, gelecekteki) ders saatleri — isteğe bağlı öğretmene göre filtrelenir.
// Aktif çocuğun bu öğretmenden zaten aldığı (BOOKED) gelecekteki dersler de aynı listede döner ki
// takvimde "senin dersin" olarak görünsün — başka çocukların rezervasyonları asla dönmez (KVKK).
router.get(
  '/slots/open',
  asyncHandler(async (req, res) => {
    const teacherId =
      typeof req.query.teacherId === 'string' && req.query.teacherId ? req.query.teacherId : undefined;
    const childId = req.user!.childId!;
    const slots = await prisma.availabilitySlot.findMany({
      where: {
        startTime: { gt: new Date() },
        ...(teacherId ? { teacherId } : {}),
        OR: [
          { status: SlotStatus.OPEN },
          { status: SlotStatus.BOOKED, booking: { childProfileId: childId } },
        ],
      },
      orderBy: { startTime: 'asc' },
      include: {
        teacher: { include: { user: { select: { name: true } } } },
        booking: { select: { childProfileId: true, topic: { select: { name: true } } } },
      },
    });
    res.json({
      slots: slots.map((s) => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        status: s.status,
        mine: s.booking?.childProfileId === childId,
        topicName: s.booking?.topic?.name ?? null,
      })),
    });
  })
);

// Aktif ders konuları (eski serbest-seçim listesi — müfredat ilerlemesi sonrası
// /materials tarafından karşılanıyor, geriye dönük uyumluluk için kalıyor)
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

// Müfredat ilerlemesi: aktif çocuğun her materyal için durumu (EXEMPT/COMPLETED/
// SCHEDULED/NEXT/LOCKED) + ünite bazlı özet ("Ünite 3 · 2/3 tamamlandı" için).
router.get(
  '/materials',
  asyncHandler(async (req, res) => {
    const childId = req.user!.childId!;
    const materials = await getMaterialStates(childId);

    const unitMap = new Map<number, { unitNumber: number; total: number; completed: number }>();
    for (const m of materials) {
      const u = unitMap.get(m.unitNumber) ?? { unitNumber: m.unitNumber, total: 0, completed: 0 };
      u.total += 1;
      if (m.state === 'COMPLETED' || m.state === 'EXEMPT') u.completed += 1;
      unitMap.set(m.unitNumber, u);
    }
    const units = [...unitMap.values()].sort((a, b) => a.unitNumber - b.unitNumber);
    const next = materials.find((m) => m.state === 'NEXT') ?? null;
    const currentUnit = next ? units.find((u) => u.unitNumber === next.unitNumber) ?? null : null;

    res.json({ materials, units, currentUnit, next });
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

    // Müfredat sırası: materyal ancak EXEMPT/COMPLETED (tekrar dersi) veya NEXT ise
    // rezerve edilebilir. Frontend'deki kilit yalnızca UX'tir — asıl doğrulama burada.
    const materialStates = await getMaterialStates(child.id);
    const materialState = materialStates.find((m) => m.topicId === data.topicId);
    if (!materialState || materialState.state === 'LOCKED') {
      throw new AppError(403, 'Bu ders için sıra henüz gelmedi');
    }
    if (materialState.state === 'SCHEDULED') {
      throw new AppError(400, 'Bu ders için zaten planlı bir dersin var');
    }
    const isReview = materialState.state === 'EXEMPT' || materialState.state === 'COMPLETED';

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
          isReview,
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
      meta: { topic: topic.name, startsAt: slot.startTime.toISOString(), isReview },
    });

    res.status(201).json({ booking });
  })
);

// Aktif çocuğun rezervasyonları
router.get(
  '/bookings',
  asyncHandler(async (req, res) => {
    const childId = req.user!.childId!;
    await healCompletedBookings(childId);
    const bookings = await prisma.booking.findMany({
      where: { childProfileId: childId },
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
      include: { slot: true, topic: true },
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

    // İptal kaydırma: bu ders ilerlemeyi etkileyen (isReview=false) bir dersse, aynı çocuğun
    // daha ileri sıradaki planlı (isReview=false) dersleri bir geri kayar — tarih/saat aynı
    // kalır, sadece materyal değişir. Tarih/saat sabit kaldığı için transaction'dan ÖNCE
    // (değişmeyen) veriyi okumak güvenli.
    const cancelledSequence = booking.topic?.sequenceOrder ?? null;
    const laterBookings =
      !booking.isReview && cancelledSequence !== null
        ? await prisma.booking.findMany({
            where: {
              childProfileId: booking.childProfileId,
              status: BookingStatus.SCHEDULED,
              isReview: false,
              topic: { sequenceOrder: { gt: cancelledSequence } },
            },
            include: { topic: true },
            orderBy: { topic: { sequenceOrder: 'asc' } },
          })
        : [];

    const shifted: { bookingId: string; fromSequence: number; toSequence: number }[] = [];
    const skipped: { bookingId: string; sequenceOrder: number }[] = [];

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

      // laterBookings sabit, transaction'dan önce okundu — sıradaki her ders bir öncekinin
      // boşalttığı materyale kayar (5→4, 6→5, ... gibi ardışık bir zincirde tek doğru sonuç).
      for (const lb of laterBookings) {
        const currentSequence = lb.topic!.sequenceOrder!;
        const targetTopic = await tx.topic.findUnique({
          where: { sequenceOrder: currentSequence - 1 },
        });
        if (targetTopic) {
          await tx.booking.update({ where: { id: lb.id }, data: { topicId: targetTopic.id } });
          shifted.push({ bookingId: lb.id, fromSequence: currentSequence, toSequence: currentSequence - 1 });
        } else {
          // Hedef sırada materyal yok (silinmiş konu gibi nadir bir durum) — bu dersi
          // olduğu gibi bırak, bozma; sadece işaretle ki fark edilsin.
          skipped.push({ bookingId: lb.id, sequenceOrder: currentSequence });
        }
      }
    });

    for (const s of shifted) {
      logEvent({
        type: 'progress.cascade_shift',
        bookingId: s.bookingId,
        childProfileId: booking.childProfileId,
        role: 'PARENT',
        meta: { fromSequence: s.fromSequence, toSequence: s.toSequence, triggeredByCancel: booking.id },
      });
    }
    for (const s of skipped) {
      logEvent({
        type: 'progress.cascade_shift_skipped',
        bookingId: s.bookingId,
        childProfileId: booking.childProfileId,
        role: 'PARENT',
        meta: { sequenceOrder: s.sequenceOrder, reason: 'target_topic_missing', triggeredByCancel: booking.id },
      });
    }

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

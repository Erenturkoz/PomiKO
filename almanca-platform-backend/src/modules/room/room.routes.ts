import { Router } from 'express';
import { Role, BookingStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler, AppError } from '../../lib/errors';
import { authenticate } from '../../middleware/auth';
import { ensureRoom, createMeetingToken, getRoomPresence } from '../../lib/daily';
import { logEvent } from '../../lib/eventlog';
import { z } from 'zod';

const router = Router();
router.use(authenticate); // her rol girebilir; yetki booking'e göre kontrol edilir

// Ders ekranına (lobiye) başlangıçtan kaç dakika önce girilebilir
const LOBBY_MINUTES = 10;

// Booking'i ilişkileriyle yükle ve erişim yetkisini doğrula
async function loadAuthorizedBooking(
  bookingId: string,
  user: { id: string; role: Role; scope: 'account' | 'profile'; childId?: string }
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      slot: true,
      child: { select: { id: true, name: true, parentUserId: true } },
      teacher: { include: { user: { select: { id: true, name: true } } } },
      topic: true,
    },
  });
  if (!booking) throw new AppError(404, 'Ders bulunamadı');

  if (user.role === Role.ADMIN) {
    // admin her dersi izleyebilir (ghost)
  } else if (user.role === Role.TEACHER) {
    if (booking.teacher.user.id !== user.id) throw new AppError(403, 'Bu derse erişimin yok');
  } else if (user.role === Role.PARENT) {
    // Veli yalnızca profil modunda ve yalnızca aktif çocuğunun dersine girebilir
    if (user.scope !== 'profile' || !user.childId) {
      throw new AppError(403, 'Derse girmek için bir çocuk profili seç');
    }
    if (booking.childProfileId !== user.childId) {
      throw new AppError(403, 'Bu derse erişimin yok');
    }
  } else {
    throw new AppError(403, 'Bu derse erişimin yok');
  }
  return booking;
}

// ============================================================
// TEST DERSİ (GEÇİCİ — sonra bu bloğu ve frontend'deki "Test dersi"
// butonunu silerek kaldırabilirsin). Rezervasyon/pencere kontrolü yok;
// giriş yapan herkes sabit "pomiko-test" odasına girebilir.
// Rol: TEACHER → üst kamera, PARENT → alt kamera, ADMIN → gizli izleyici.
// ============================================================
router.post(
  '/test/join',
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    const roomName = 'pomiko-test';
    const room = await ensureRoom(roomName); // exp yok → kalıcı test odası

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { name: true },
    });

    const token = await createMeetingToken({
      roomName,
      userName: user?.name ?? 'Test kullanıcı',
      role,
      isOwner: role === Role.TEACHER,
      ghost: role === Role.ADMIN,
    });

    // En güncel aktif konunun materyalini kullan (varsa)
    const topic = await prisma.topic.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    res.json({
      roomUrl: room.url,
      token,
      role,
      serverNow: now.toISOString(),
      startsAt: new Date(now.getTime() - 60_000).toISOString(), // test: ders "başlamış" sayılır
      endsAt: new Date(now.getTime() + 6 * 60 * 60_000).toISOString(), // test: uzun süre açık
      material: topic?.materialUrl
        ? { name: topic.name, fileUrl: topic.materialUrl, filename: topic.materialFilename }
        : null,
    });
  })
);
// ============================================================
// TEST DERSİ sonu
// ============================================================


// Ders bilgisi (lobi için): sunucu saati + ders saatleri + materyal.
// Daily'ye BAĞLANMAZ — sadece geri sayım ve hazırlık için.
router.get(
  '/:bookingId/info',
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    const booking = await loadAuthorizedBooking(req.params.bookingId, req.user!);

    if (booking.status === BookingStatus.CANCELLED) {
      throw new AppError(400, 'Bu ders iptal edilmiş');
    }

    const now = Date.now();
    const start = booking.slot.startTime.getTime();
    const end = booking.slot.endTime.getTime();
    const lobbyOpensAt = start - LOBBY_MINUTES * 60 * 1000;

    // Admin her zaman girebilir; diğerleri lobi açılışından önce giremez
    if (role !== Role.ADMIN && now < lobbyOpensAt) {
      const mins = Math.ceil((lobbyOpensAt - now) / 60000);
      throw new AppError(
        403,
        `Ders ekranı başlangıçtan ${LOBBY_MINUTES} dk önce açılır. Açılmasına ${mins} dk var.`
      );
    }
    if (now > end) {
      throw new AppError(400, 'Bu dersin süresi doldu');
    }

    logEvent({
      type: 'room.lobby',
      bookingId: booking.id,
      userId: req.user!.id,
      childProfileId: booking.childProfileId,
      actorName: role === Role.TEACHER ? booking.teacher.user.name : booking.child.name,
      role,
    });

    res.json({
      role,
      serverNow: new Date(now).toISOString(),
      startsAt: booking.slot.startTime.toISOString(),
      endsAt: booking.slot.endTime.toISOString(),
      lobbyOpensAt: new Date(lobbyOpensAt).toISOString(),
      material: booking.topic?.materialUrl
        ? {
            name: booking.topic.name,
            fileUrl: booking.topic.materialUrl,
            filename: booking.topic.materialFilename,
          }
        : null,
    });
  })
);

// Derse katıl: role göre Daily oda URL'i + token + ders materyali döndürür
router.post(
  '/:bookingId/join',
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    const booking = await loadAuthorizedBooking(req.params.bookingId, req.user!);

    if (booking.status === BookingStatus.CANCELLED) {
      throw new AppError(400, 'Bu ders iptal edilmiş');
    }

    // BAĞLANMA KURALI (sunucu saatiyle): ders BAŞLAMADAN kimse odaya bağlanamaz.
    // Lobide (başlangıçtan 10 dk önce) beklenir ama Daily'ye bağlanılmaz.
    // Admin (gizli gözlemci) bu kuraldan muaf.
    if (role !== Role.ADMIN) {
      const now = Date.now();
      const start = booking.slot.startTime.getTime();
      const end = booking.slot.endTime.getTime();
      if (now > end) {
        throw new AppError(400, 'Bu dersin süresi doldu');
      }
      if (now < start) {
        const secs = Math.ceil((start - now) / 1000);
        throw new AppError(403, `Ders henüz başlamadı. Başlamasına ${secs} saniye var.`);
      }
    }

    const roomName = booking.roomName ?? `lesson-${booking.id}`;

    // TEK GİRİŞ KURALI: odada aynı anda yalnızca 1 öğretmen + 1 öğrenci olabilir.
    // Admin (ghost) presence'ta görünmez, bu kuraldan etkilenmez.
    if (role !== Role.ADMIN) {
      const present = await getRoomPresence(roomName);
      const already = present.some((p) => p.userId === role);
      if (already) {
        logEvent({
          type: 'room.blocked_duplicate',
          bookingId: booking.id,
          userId: req.user!.id,
          childProfileId: booking.childProfileId,
          role,
        });
        throw new AppError(
          409,
          role === Role.TEACHER
            ? 'Bu derse zaten başka bir cihazdan/sekmeden girilmiş. Diğer oturumu kapatıp tekrar dene.'
            : 'Bu derse zaten girilmiş. Aynı anda tek cihazdan katılabilirsin; diğer sekmeyi/cihazı kapat.'
        );
      }
    }

    // Oda, ders bitiminden 30 dk sonra otomatik silinsin (oda birikmesini önler)
    const expUnix = Math.floor(booking.slot.endTime.getTime() / 1000) + 30 * 60;
    const room = await ensureRoom(roomName, expUnix);

    const userName =
      role === Role.TEACHER
        ? booking.teacher.user.name
        : role === Role.PARENT
          ? booking.child.name
          : 'Gözetmen';

    const token = await createMeetingToken({
      roomName,
      userName,
      role,
      isOwner: role === Role.TEACHER,
      ghost: role === Role.ADMIN,
    });

    logEvent({
      type: 'room.connect',
      bookingId: booking.id,
      userId: req.user!.id,
      childProfileId: booking.childProfileId,
      actorName: userName,
      role,
    });

    res.json({
      roomUrl: room.url,
      token,
      role,
      serverNow: new Date().toISOString(),
      startsAt: booking.slot.startTime.toISOString(),
      endsAt: booking.slot.endTime.toISOString(),
      material: booking.topic?.materialUrl
        ? {
            name: booking.topic.name,
            fileUrl: booking.topic.materialUrl,
            filename: booking.topic.materialFilename,
          }
        : null,
    });
  })
);

// İstemciden gelen ders olayları (ayrılma, kamera/mikrofon değişimi).
// Not: tarayıcı kapanırsa bu gelmeyebilir; kalıcı çözüm Daily webhook'ları.
const eventSchema = z.object({
  type: z.enum(['room.leave', 'room.media', 'room.ended']),
  meta: z.record(z.any()).optional(),
});

router.post(
  '/:bookingId/event',
  asyncHandler(async (req, res) => {
    const data = eventSchema.parse(req.body);
    const booking = await loadAuthorizedBooking(req.params.bookingId, req.user!);
    logEvent({
      type: data.type,
      bookingId: booking.id,
      userId: req.user!.id,
      childProfileId: booking.childProfileId,
      role: req.user!.role,
      meta: data.meta ?? null,
    });
    res.json({ ok: true });
  })
);

export default router;

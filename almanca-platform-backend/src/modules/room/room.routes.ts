import { randomUUID } from 'crypto';
import { Router } from 'express';
import { Role, BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler, AppError } from '../../lib/errors';
import { authenticate } from '../../middleware/auth';
import { ensureRoom, createMeetingToken } from '../../lib/daily';
import { logEvent } from '../../lib/eventlog';
import { z } from 'zod';

const router = Router();
router.use(authenticate); // her rol girebilir; yetki booking'e göre kontrol edilir

// Ders ekranına (lobiye) başlangıçtan kaç dakika önce girilebilir
const LOBBY_MINUTES = 10;

// Bir oturumdan bu kadar süre heartbeat gelmezse "bayat" sayılır ve yeni bir bağlantı
// devralabilir (sekme yenilendi/kapandı/çöktü demektir). İstemci ~7 sn'de bir heartbeat atar.
const SESSION_STALE_MS = 20_000;

// TEK CİHAZ KURALI: bookingId+role başına DB'de tek "aktif oturum" satırı (RoomSession).
// Daily'nin presence bilgisi ungraceful kopmalarda (yenileme/çökme) saniyelerce/dakikalarca
// gecikebiliyor — bu yüzden tek doğru kaynak artık Daily değil, heartbeat ile taze tutulan bu
// tablo. Satır yoksa oluştur; varsa ve taze ise 409; bayatsa devral (sessionId'yi değiştir).
async function claimRoomSession(bookingId: string, role: Role): Promise<string> {
  const sessionId = randomUUID();
  const now = new Date();
  try {
    await prisma.roomSession.create({ data: { bookingId, role, sessionId, lastSeenAt: now } });
    return sessionId;
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
    const existing = await prisma.roomSession.findUnique({
      where: { bookingId_role: { bookingId, role } },
    });
    const stale = !existing || now.getTime() - existing.lastSeenAt.getTime() > SESSION_STALE_MS;
    if (!stale) {
      throw new AppError(
        409,
        role === Role.TEACHER
          ? 'Bu derse zaten başka bir cihazdan/sekmeden girilmiş. Diğer oturumu kapatıp tekrar dene.'
          : 'Bu derse zaten girilmiş. Aynı anda tek cihazdan katılabilirsin; diğer sekmeyi/cihazı kapat.',
        'SESSION_ACTIVE'
      );
    }
    await prisma.roomSession.update({
      where: { bookingId_role: { bookingId, role } },
      data: { sessionId, lastSeenAt: now },
    });
    return sessionId;
  }
}

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
      stars: 0,
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
      stars: booking.stars,
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

    // TEK CİHAZ KURALI: admin (ghost) bu kuraldan muaf, presence'ta zaten görünmüyor.
    let sessionId: string | null = null;
    if (role !== Role.ADMIN) {
      try {
        sessionId = await claimRoomSession(booking.id, role);
      } catch (err) {
        if (err instanceof AppError && err.code === 'SESSION_ACTIVE') {
          logEvent({
            type: 'room.blocked_duplicate',
            bookingId: booking.id,
            userId: req.user!.id,
            childProfileId: booking.childProfileId,
            role,
          });
        }
        throw err;
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
      sessionId,
      serverNow: new Date().toISOString(),
      startsAt: booking.slot.startTime.toISOString(),
      endsAt: booking.slot.endTime.toISOString(),
      stars: booking.stars,
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

// Oturumu canlı tut: istemci ders içindeyken periyodik olarak çağırır. sessionId bu bağlantıya
// aitse (başka bir cihaz devralmadıysa) lastSeenAt tazelenir; eşleşmiyorsa (ok:false) istemci
// başka bir cihazın bu oturumu devraldığını anlar ve bağlantısını nazikçe sonlandırmalı.
const heartbeatSchema = z.object({ sessionId: z.string().min(1) });

router.post(
  '/:bookingId/heartbeat',
  asyncHandler(async (req, res) => {
    const { sessionId } = heartbeatSchema.parse(req.body);
    const role = req.user!.role;
    if (role === Role.ADMIN) {
      res.json({ ok: true });
      return;
    }
    const booking = await loadAuthorizedBooking(req.params.bookingId, req.user!);
    const updated = await prisma.roomSession.updateMany({
      where: { bookingId: booking.id, role, sessionId },
      data: { lastSeenAt: new Date() },
    });
    res.json({ ok: updated.count > 0 });
  })
);

// Öğretmen öğrenciye yıldız verir (0..5). Bu derse özeldir ve kalıcı olarak Booking.stars'a
// yazılır (öğrenci/veli panelinde toplam olarak görünür). Canlı efekt istemcide app-message
// ile senkronlanır; bu uç yalnızca KALICILIK içindir. "Ayarla" mantığı: gönderilen değer
// mutlak yıldız sayısıdır (artır/azalt değil), böylece geri alma da desteklenir.
const starsSchema = z.object({ count: z.number().int().min(0).max(5) });

router.post(
  '/:bookingId/stars',
  asyncHandler(async (req, res) => {
    if (req.user!.role !== Role.TEACHER) {
      throw new AppError(403, 'Yıldızları yalnızca öğretmen verebilir');
    }
    const { count } = starsSchema.parse(req.body);
    const booking = await loadAuthorizedBooking(req.params.bookingId, req.user!);
    await prisma.booking.update({ where: { id: booking.id }, data: { stars: count } });
    logEvent({
      type: 'lesson.stars',
      bookingId: booking.id,
      userId: req.user!.id,
      childProfileId: booking.childProfileId,
      role: Role.TEACHER,
      meta: { count },
    });
    res.json({ ok: true, stars: count });
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
    // Temiz ayrılışta oturum kaydını hemen bırak — bir sonraki bağlantı SESSION_STALE_MS'i
    // beklemeden anında devralabilsin. sessionId eşleşmiyorsa (zaten devredilmiş eski bir
    // oturuma ait beacon) dokunma — yeni oturumu yanlışlıkla silmeyelim.
    if (data.type === 'room.leave' && req.user!.role !== Role.ADMIN) {
      const sid = typeof data.meta?.sessionId === 'string' ? data.meta.sessionId : undefined;
      if (sid) {
        await prisma.roomSession
          .deleteMany({ where: { bookingId: booking.id, role: req.user!.role, sessionId: sid } })
          .catch(() => undefined);
      }
    }
    res.json({ ok: true });
  })
);

export default router;

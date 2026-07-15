import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { hashPassword } from '../../lib/password';
import { asyncHandler, AppError } from '../../lib/errors';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';
import { uploadPdf, uploadImage } from '../../lib/upload';

const router = Router();

// Tüm admin uçları: önce giriş, sonra ADMIN rolü
router.use(authenticate, requireRole(Role.ADMIN));

const createTeacherSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  bio: z.string().optional(),
  languages: z.array(z.string()).default(['de', 'tr']),
});

// Öğretmen hesabı oluştur (yalnızca admin)
router.post(
  '/teachers',
  asyncHandler(async (req, res) => {
    const data = createTeacherSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError(409, 'Bu e-posta zaten kayıtlı');

    const teacher = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash: await hashPassword(data.password),
        name: data.name,
        role: Role.TEACHER,
        teacherProfile: {
          create: {
            bio: data.bio,
            languages: data.languages,
            phone: data.phone,
            birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
            education: data.education,
            experienceYears: data.experienceYears,
            specialties: data.specialties,
            iban: data.iban,
            startDate: data.startDate ? new Date(data.startDate) : undefined,
            adminNote: data.adminNote,
            initialPassword: data.password, // kopyalama için; parola değişince silinecek
          },
        },
      },
      include: { teacherProfile: true },
    });

    res.status(201).json({
      teacher: {
        id: teacher.id,
        email: teacher.email,
        name: teacher.name,
        teacherProfileId: teacher.teacherProfile?.id,
      },
    });
  })
);

router.get(
  '/teachers',
  asyncHandler(async (_req, res) => {
    const teachers = await prisma.user.findMany({
      where: { role: Role.TEACHER },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        teacherProfile: { select: { id: true, bio: true, languages: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ teachers });
  })
);

// Yaklaşan/aktif dersleri listele (admin gizli izleme için)
router.get(
  '/bookings',
  asyncHandler(async (_req, res) => {
    const bookings = await prisma.booking.findMany({
      where: { status: { not: 'CANCELLED' } },
      orderBy: { slot: { startTime: 'asc' } },
      include: {
        slot: true,
        child: { select: { name: true, parent: { select: { name: true } } } },
        teacher: { include: { user: { select: { name: true } } } },
      },
    });
    res.json({ bookings });
  })
);

// --- Ders konuları ---

// Yeni konu oluştur (PDF materyaliyle). Oluşturulunca velilerin listesine düşer.
router.post(
  '/topics',
  uploadPdf.single('file'),
  asyncHandler(async (req, res) => {
    const name = String(req.body.name ?? '').trim();
    const description = String(req.body.description ?? '').trim() || null;
    if (name.length < 2) throw new AppError(400, 'Konu adı en az 2 karakter olmalı');
    if (!req.file) throw new AppError(400, 'PDF materyali gerekli');

    const topic = await prisma.topic.create({
      data: {
        name,
        description,
        materialUrl: `/uploads/${req.file.filename}`,
        materialFilename: req.file.originalname,
      },
    });
    res.status(201).json({ topic });
  })
);

router.get(
  '/topics',
  asyncHandler(async (_req, res) => {
    const topics = await prisma.topic.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ topics });
  })
);

router.delete(
  '/topics/:id',
  asyncHandler(async (req, res) => {
    try {
      await prisma.topic.delete({ where: { id: req.params.id } });
    } catch {
      throw new AppError(404, 'Konu bulunamadı');
    }
    res.json({ ok: true });
  })
);

// ============================================================
// ANA SAYFA İÇERİK YÖNETİMİ (CMS)
// ============================================================

// --- İçerik blokları (hero, özellikler, seviyeler, paketler, SSS...) ---

router.get(
  '/site/content',
  asyncHandler(async (_req, res) => {
    const blocks = await prisma.siteContent.findMany();
    const content: Record<string, unknown> = {};
    for (const b of blocks) content[b.key] = b.value;
    res.json({ content });
  })
);

const contentSchema = z.object({ value: z.any() });

router.put(
  '/site/content/:key',
  asyncHandler(async (req, res) => {
    const { value } = contentSchema.parse(req.body);
    const block = await prisma.siteContent.upsert({
      where: { key: req.params.key },
      create: { key: req.params.key, value },
      update: { value },
    });
    res.json({ block });
  })
);

// --- Öğretmenlerin ana sayfa görünürlüğü ---

router.get(
  '/site/teachers',
  asyncHandler(async (_req, res) => {
    const teachers = await prisma.teacherProfile.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { user: { select: { name: true, email: true } } },
    });
    res.json({
      teachers: teachers.map((t) => ({
        id: t.id,
        name: t.user.name,
        email: t.user.email,
        bio: t.bio,
        headline: t.headline,
        photoUrl: t.photoUrl,
        showOnHome: t.showOnHome,
        sortOrder: t.sortOrder,
      })),
    });
  })
);

const teacherHomeSchema = z.object({
  showOnHome: z.boolean().optional(),
  headline: z.string().max(120).optional().nullable(),
  bio: z.string().max(600).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

router.put(
  '/site/teachers/:id',
  asyncHandler(async (req, res) => {
    const data = teacherHomeSchema.parse(req.body);
    const teacher = await prisma.teacherProfile.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ teacher });
  })
);

// Öğretmen fotoğrafı yükle
router.post(
  '/site/teachers/:id/photo',
  uploadImage.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError(400, 'Görsel gerekli');
    const teacher = await prisma.teacherProfile.update({
      where: { id: req.params.id },
      data: { photoUrl: `/uploads/${req.file.filename}` },
    });
    res.json({ photoUrl: teacher.photoUrl });
  })
);

// --- Veli yorumları ---

router.get(
  '/site/testimonials',
  asyncHandler(async (_req, res) => {
    const testimonials = await prisma.testimonial.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ testimonials });
  })
);

const testimonialSchema = z.object({
  name: z.string().min(2),
  role: z.string().max(120).optional().nullable(),
  text: z.string().min(5).max(800),
  rating: z.number().int().min(1).max(5).default(5),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

router.post(
  '/site/testimonials',
  asyncHandler(async (req, res) => {
    const data = testimonialSchema.parse(req.body);
    const testimonial = await prisma.testimonial.create({ data });
    res.status(201).json({ testimonial });
  })
);

router.put(
  '/site/testimonials/:id',
  asyncHandler(async (req, res) => {
    const data = testimonialSchema.partial().parse(req.body);
    const testimonial = await prisma.testimonial.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ testimonial });
  })
);

router.delete(
  '/site/testimonials/:id',
  asyncHandler(async (req, res) => {
    try {
      await prisma.testimonial.delete({ where: { id: req.params.id } });
    } catch {
      throw new AppError(404, 'Yorum bulunamadı');
    }
    res.json({ ok: true });
  })
);

// ============================================================
// OLAY KAYITLARI (LOG) — yalnızca admin görür
// ============================================================
router.get(
  '/logs',
  asyncHandler(async (req, res) => {
    const type = typeof req.query.type === 'string' && req.query.type ? req.query.type : undefined;
    const bookingId =
      typeof req.query.bookingId === 'string' && req.query.bookingId ? req.query.bookingId : undefined;
    const q = typeof req.query.q === 'string' && req.query.q ? req.query.q : undefined;
    const take = Math.min(Number(req.query.take) || 60, 200);
    const skip = Math.max(Number(req.query.skip) || 0, 0);

    const where: any = {};
    if (type) where.type = type;
    if (bookingId) where.bookingId = bookingId;
    if (q) where.actorName = { contains: q, mode: 'insensitive' };

    const [logs, total] = await Promise.all([
      prisma.eventLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      prisma.eventLog.count({ where }),
    ]);

    res.json({ logs, total, take, skip });
  })
);

// Bir dersin katılım özeti (kim ne zaman bağlandı/ayrıldı)
router.get(
  '/logs/booking/:bookingId',
  asyncHandler(async (req, res) => {
    const logs = await prisma.eventLog.findMany({
      where: { bookingId: req.params.bookingId },
      orderBy: { createdAt: 'asc' },
    });

    // Rol bazında ilk bağlanma / son ayrılma
    const summary: Record<string, { connectedAt?: string; leftAt?: string; minutes?: number }> = {};
    for (const l of logs) {
      const r = l.role ?? 'UNKNOWN';
      if (l.type === 'room.connect' && !summary[r]?.connectedAt) {
        summary[r] = { ...(summary[r] ?? {}), connectedAt: l.createdAt.toISOString() };
      }
      if (l.type === 'room.leave' || l.type === 'room.ended') {
        summary[r] = { ...(summary[r] ?? {}), leftAt: l.createdAt.toISOString() };
      }
    }
    for (const r of Object.keys(summary)) {
      const s = summary[r];
      if (s.connectedAt && s.leftAt) {
        s.minutes = Math.max(
          0,
          Math.round((new Date(s.leftAt).getTime() - new Date(s.connectedAt).getTime()) / 60000)
        );
      }
    }

    res.json({ logs, summary });
  })
);

// Öğretmen detayı (özlük bilgileri + yaklaşan takvim) — popup için
router.get(
  '/teachers/:userId/detail',
  asyncHandler(async (req, res) => {
    const teacher = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        teacherProfile: true,
      },
    });
    if (!teacher || !teacher.teacherProfile) throw new AppError(404, 'Öğretmen bulunamadı');

    const slots = await prisma.availabilitySlot.findMany({
      where: {
        teacherId: teacher.teacherProfile.id,
        startTime: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { startTime: 'asc' },
      take: 40,
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            child: { select: { name: true } },
            topic: { select: { name: true } },
          },
        },
      },
    });

    res.json({
      teacher: {
        id: teacher.id,
        email: teacher.email,
        name: teacher.name,
        createdAt: teacher.createdAt,
        profile: teacher.teacherProfile,
      },
      slots: slots.map((sl) => ({
        id: sl.id,
        startTime: sl.startTime,
        endTime: sl.endTime,
        status: sl.status,
        booking: sl.booking && sl.booking.status !== 'CANCELLED' ? sl.booking : null,
      })),
    });
  })
);

const updateTeacherSchema = createTeacherSchema.partial().omit({ password: true, email: true });

// Öğretmen özlük bilgilerini güncelle
router.put(
  '/teachers/:userId/detail',
  asyncHandler(async (req, res) => {
    const data = updateTeacherSchema.parse(req.body);
    const teacher = await prisma.user.findUnique({
      where: { id: req.params.userId },
      include: { teacherProfile: true },
    });
    if (!teacher?.teacherProfile) throw new AppError(404, 'Öğretmen bulunamadı');

    if (data.name) {
      await prisma.user.update({ where: { id: teacher.id }, data: { name: data.name } });
    }
    await prisma.teacherProfile.update({
      where: { id: teacher.teacherProfile.id },
      data: {
        bio: data.bio,
        phone: data.phone,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        education: data.education,
        experienceYears: data.experienceYears,
        specialties: data.specialties,
        iban: data.iban,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        adminNote: data.adminNote,
      },
    });
    res.json({ ok: true });
  })
);

// ============================================================
// VELİLER — profiller, çocuklar, rezervasyonlar
// ============================================================

router.get(
  '/parents',
  asyncHandler(async (_req, res) => {
    const parents = await prisma.user.findMany({
      where: { role: Role.PARENT },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        children: { select: { id: true, name: true, age: true, credits: true } },
      },
    });
    res.json({ parents });
  })
);

// Veli detayı: çocuklar + tüm rezervasyonlar
router.get(
  '/parents/:userId/detail',
  asyncHandler(async (req, res) => {
    const parent = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        children: { select: { id: true, name: true, age: true, birthDate: true, credits: true } },
      },
    });
    if (!parent) throw new AppError(404, 'Veli bulunamadı');

    const bookings = await prisma.booking.findMany({
      where: { child: { parentUserId: parent.id } },
      orderBy: { slot: { startTime: 'desc' } },
      take: 60,
      include: {
        slot: { select: { startTime: true, endTime: true } },
        child: { select: { name: true } },
        teacher: { include: { user: { select: { name: true } } } },
        topic: { select: { name: true } },
      },
    });

    res.json({ parent, bookings });
  })
);

const adminChildSchema = z.object({
  name: z.string().min(2),
  age: z.number().int().min(3).max(18),
  birthDate: z.string().datetime().optional(),
});

// Veliye çocuk ekle (admin — 2 çocuk sınırına TAKILMAZ; 3+ durumlar bunun için)
router.post(
  '/parents/:userId/children',
  asyncHandler(async (req, res) => {
    const data = adminChildSchema.parse(req.body);
    const parent = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!parent || parent.role !== Role.PARENT) throw new AppError(404, 'Veli bulunamadı');

    const child = await prisma.$transaction(async (tx) => {
      const c = await tx.childProfile.create({
        data: {
          parentUserId: parent.id,
          name: data.name,
          age: data.age,
          birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        },
      });
      await tx.consent.create({
        data: { parentUserId: parent.id, childProfileId: c.id, consentVersion: 'kvkk-2026-01' },
      });
      return c;
    });
    res.status(201).json({ child });
  })
);

export default router;

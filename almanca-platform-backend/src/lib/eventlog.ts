import { prisma } from './prisma';

/**
 * Olay kaydı yazar. Loglama ASLA asıl işlemi bozmamalı:
 * hata olursa sessizce yutulur, sadece konsola düşer.
 */
export type EventType =
  // ders odası
  | 'room.lobby'
  | 'room.connect'
  | 'room.leave'
  | 'room.blocked_duplicate'
  | 'room.ended'
  | 'room.media'
  // rezervasyon / kredi
  | 'booking.create'
  | 'booking.cancel'
  | 'credit.topup'
  // kimlik
  | 'auth.login'
  | 'auth.register'
  | 'profile.select'
  | 'profile.unlock_ok'
  | 'profile.unlock_fail'
  // yönetim
  | 'admin.topic_create'
  | 'admin.topic_delete'
  | 'admin.teacher_create';

interface LogInput {
  type: EventType;
  bookingId?: string | null;
  userId?: string | null;
  childProfileId?: string | null;
  actorName?: string | null;
  role?: string | null;
  meta?: Record<string, unknown> | null;
}

export function logEvent(input: LogInput): void {
  // await edilmez: log yazımı isteği yavaşlatmasın
  prisma.eventLog
    .create({
      data: {
        type: input.type,
        bookingId: input.bookingId ?? null,
        userId: input.userId ?? null,
        childProfileId: input.childProfileId ?? null,
        actorName: input.actorName ?? null,
        role: input.role ?? null,
        meta: (input.meta ?? undefined) as any,
      },
    })
    .catch((err) => console.error('[log] yazılamadı:', err?.message));
}

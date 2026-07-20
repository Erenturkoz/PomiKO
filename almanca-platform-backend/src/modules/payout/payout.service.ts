import { BookingStatus, PayoutStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logEvent } from '../../lib/eventlog';

// Süresi geçmiş SCHEDULED dersleri COMPLETED'e çevirir (öğretmen kapsamlı ya da genel).
// progress.service.ts'teki healCompletedBookings ile aynı fikir; öğretmen/admin tarafı
// için burada ayrıca tutulur (o modülün genel API'sine bağımlılık eklemeden).
async function healCompleted(teacherId?: string) {
  await prisma.booking.updateMany({
    where: {
      status: BookingStatus.SCHEDULED,
      slot: { endTime: { lt: new Date() } },
      ...(teacherId ? { teacherId } : {}),
    },
    data: { status: BookingStatus.COMPLETED },
  });
}

// Otomatik ödeme değerlendirmesi: tamamlanmış + PENDING derslerde hem öğretmenin hem
// velinin odaya bağlandığına dair EventLog ('room.connect') kanıtı varsa APPROVED'a
// çevirir. Kanıt eksikse (biri hiç bağlanmamışsa) PENDING kalır — "önce kırmızı, incele,
// sonra yeşil" prensibi. Admin'in elle REJECTED yaptığı bir ders asla otomatik değişmez
// (sorgu zaten yalnızca PENDING olanları hedefler).
export async function evaluatePayouts(teacherId?: string): Promise<void> {
  await healCompleted(teacherId);

  const pending = await prisma.booking.findMany({
    where: {
      status: BookingStatus.COMPLETED,
      payoutStatus: PayoutStatus.PENDING,
      ...(teacherId ? { teacherId } : {}),
    },
    select: { id: true },
  });
  if (pending.length === 0) return;

  const bookingIds = pending.map((b) => b.id);
  const connects = await prisma.eventLog.findMany({
    where: { type: 'room.connect', bookingId: { in: bookingIds } },
    select: { bookingId: true, role: true },
  });

  const rolesByBooking = new Map<string, Set<string>>();
  for (const c of connects) {
    if (!c.bookingId) continue;
    const set = rolesByBooking.get(c.bookingId) ?? new Set<string>();
    if (c.role) set.add(c.role);
    rolesByBooking.set(c.bookingId, set);
  }

  const approvedIds = bookingIds.filter((id) => {
    const roles = rolesByBooking.get(id);
    return roles?.has('TEACHER') && roles?.has('PARENT');
  });
  if (approvedIds.length === 0) return;

  await prisma.booking.updateMany({
    where: { id: { in: approvedIds } },
    data: { payoutStatus: PayoutStatus.APPROVED },
  });

  for (const id of approvedIds) {
    logEvent({ type: 'payout.auto_approved', bookingId: id, meta: { reason: 'room_connect_evidence' } });
  }
}

export interface PayoutSummary {
  lessonRate: number;
  monthApproved: number;
  monthApprovedEarnings: number;
  monthPending: number;
  monthRejected: number;
}

// Bir öğretmenin bu ayki özet kazancı — yalnızca APPROVED dersler kazanca sayılır.
// Ay, dersin gerçekleştiği tarihe (slot.startTime) göre belirlenir.
export async function getTeacherPayoutSummary(teacherId: string): Promise<PayoutSummary> {
  const teacher = await prisma.teacherProfile.findUnique({
    where: { id: teacherId },
    select: { lessonRate: true },
  });
  const lessonRate = teacher?.lessonRate ?? 0;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthFilter = { slot: { startTime: { gte: monthStart } } };

  const [monthApproved, monthPending, monthRejected] = await Promise.all([
    prisma.booking.count({
      where: { teacherId, payoutStatus: PayoutStatus.APPROVED, ...monthFilter },
    }),
    prisma.booking.count({
      where: {
        teacherId,
        payoutStatus: PayoutStatus.PENDING,
        status: BookingStatus.COMPLETED,
        ...monthFilter,
      },
    }),
    prisma.booking.count({
      where: { teacherId, payoutStatus: PayoutStatus.REJECTED, ...monthFilter },
    }),
  ]);

  return {
    lessonRate,
    monthApproved,
    monthApprovedEarnings: monthApproved * lessonRate,
    monthPending,
    monthRejected,
  };
}

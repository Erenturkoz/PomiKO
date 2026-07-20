import { prisma } from '../../lib/prisma';

export type MaterialStateName = 'EXEMPT' | 'COMPLETED' | 'SCHEDULED' | 'NEXT' | 'LOCKED';

export interface TopicForState {
  id: string;
  sequenceOrder: number;
}

export interface BookingForState {
  topicId: string | null;
  status: string; // 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'
  isReview: boolean;
}

export interface MaterialState {
  topicId: string;
  sequenceOrder: number;
  state: MaterialStateName;
}

// Saf hesaplama — Prisma'ya dokunmaz, doğrudan unit test edilir.
// Sıra kuralı (öncelik sırasıyla): EXEMPT > COMPLETED > SCHEDULED > NEXT (en küçük sıradaki
// kapsanmamış materyal) > LOCKED. Tekrar dersleri (isReview=true) hiçbir kümeye girmez,
// dolayısıyla ilerlemeyi hiçbir şekilde etkilemez.
export function computeMaterialStates(
  topics: TopicForState[],
  bookings: BookingForState[],
  startSequenceOrder: number
): MaterialState[] {
  const sorted = [...topics].sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  const completedTopicIds = new Set(
    bookings
      .filter((b) => !b.isReview && b.status === 'COMPLETED' && b.topicId)
      .map((b) => b.topicId as string)
  );
  const scheduledTopicIds = new Set(
    bookings
      .filter((b) => !b.isReview && b.status === 'SCHEDULED' && b.topicId)
      .map((b) => b.topicId as string)
  );

  let nextAssigned = false;
  const states: MaterialState[] = [];

  for (const topic of sorted) {
    let state: MaterialStateName;
    if (topic.sequenceOrder < startSequenceOrder) {
      state = 'EXEMPT';
    } else if (completedTopicIds.has(topic.id)) {
      state = 'COMPLETED';
    } else if (scheduledTopicIds.has(topic.id)) {
      state = 'SCHEDULED';
    } else if (!nextAssigned) {
      state = 'NEXT';
      nextAssigned = true;
    } else {
      state = 'LOCKED';
    }
    states.push({ topicId: topic.id, sequenceOrder: topic.sequenceOrder, state });
  }

  return states;
}

// Süresi geçmiş ama hâlâ SCHEDULED kalan dersleri COMPLETED'e çevirir (lazy self-healing).
// Projede cron/zamanlanmış iş altyapısı yok; bu yüzden "tamamlandı" durumu her okuma
// öncesinde fırsatçı şekilde DB'ye yazılır. isReview farkı gözetmez — "ders gerçekleşti mi"
// sorusu, "ilerlemeyi etkiler mi" sorusundan bağımsızdır.
export async function healCompletedBookings(childProfileId: string): Promise<void> {
  await prisma.booking.updateMany({
    where: {
      childProfileId,
      status: 'SCHEDULED',
      slot: { endTime: { lt: new Date() } },
    },
    data: { status: 'COMPLETED' },
  });
}

export interface MaterialStateWithTopic extends MaterialState {
  name: string;
  description: string | null;
  unitNumber: number;
  orderInUnit: number;
}

// İnce async sarmalayıcı: heal → veriyi çek → saf fonksiyonu çağır → materyal bilgisiyle birleştir.
export async function getMaterialStates(childProfileId: string): Promise<MaterialStateWithTopic[]> {
  await healCompletedBookings(childProfileId);

  const [child, topics, bookings] = await Promise.all([
    prisma.childProfile.findUniqueOrThrow({
      where: { id: childProfileId },
      select: { startSequenceOrder: true },
    }),
    prisma.topic.findMany({
      where: { active: true, sequenceOrder: { not: null } },
      orderBy: { sequenceOrder: 'asc' },
    }),
    prisma.booking.findMany({
      where: { childProfileId },
      select: { topicId: true, status: true, isReview: true },
    }),
  ]);

  // sequenceOrder: { not: null } sorgusu garanti etse de, Prisma'nın ürettiği tip hâlâ
  // `number | null` — burada tek seferde hem daraltıyor hem materyal bilgisini haritalıyoruz.
  const validTopics = topics
    .filter((t): t is typeof t & { sequenceOrder: number } => t.sequenceOrder !== null)
    .map((t) => ({
      id: t.id,
      sequenceOrder: t.sequenceOrder,
      name: t.name,
      description: t.description,
      unitNumber: t.unitNumber ?? 0,
      orderInUnit: t.orderInUnit ?? 0,
    }));

  const states = computeMaterialStates(validTopics, bookings, child.startSequenceOrder);
  const topicById = new Map(validTopics.map((t) => [t.id, t]));

  return states.map((s) => {
    const topic = topicById.get(s.topicId)!;
    return {
      ...s,
      name: topic.name,
      description: topic.description,
      unitNumber: topic.unitNumber,
      orderInUnit: topic.orderInUnit,
    };
  });
}

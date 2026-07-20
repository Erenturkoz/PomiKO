// Tek seferlik backfill: mevcut Topic'lere müfredat sırası atar.
// Çalıştır: npx tsx prisma/backfill-topic-sequence.ts
// (seed.ts'e bilerek gömülmedi — yanlışlıkla `npm run seed` ile tekrar çalışıp
// sequenceOrder'ları createdAt sırasına sıfırlamasın.)
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const topics = await prisma.topic.findMany({
    where: { sequenceOrder: null },
    orderBy: { createdAt: 'asc' },
  });

  if (topics.length === 0) {
    console.log('ℹ️  Sırası atanmamış konu yok, yapılacak bir şey kalmadı.');
    return;
  }

  const existingMax = await prisma.topic.aggregate({ _max: { sequenceOrder: true } });
  let next = (existingMax._max.sequenceOrder ?? 0) + 1;

  for (const topic of topics) {
    const sequenceOrder = next++;
    const unitNumber = Math.ceil(sequenceOrder / 3);
    const orderInUnit = ((sequenceOrder - 1) % 3) + 1;
    await prisma.topic.update({
      where: { id: topic.id },
      data: { sequenceOrder, unitNumber, orderInUnit },
    });
    console.log(`✅ ${topic.name} → sıra ${sequenceOrder} (ünite ${unitNumber}, ünite içi ${orderInUnit})`);
  }

  console.log(`\n${topics.length} konuya sıra atandı.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@platform.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';
  const name = process.env.SEED_ADMIN_NAME ?? 'Platform Admin';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`ℹ️  Admin zaten var: ${email}`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      name,
      role: Role.ADMIN,
    },
  });
  console.log(`✅ Admin oluşturuldu: ${email} (parola: ${password})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

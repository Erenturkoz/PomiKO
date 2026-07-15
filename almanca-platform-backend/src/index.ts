import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`✅ Sunucu çalışıyor: http://localhost:${env.PORT}`);
});

// Düzgün kapanış
async function shutdown() {
  console.log('\nKapanıyor...');
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

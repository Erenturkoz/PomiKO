import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/error';

import authRoutes from './modules/auth/auth.routes';
import adminRoutes from './modules/admin/admin.routes';
import childrenRoutes from './modules/children/children.routes';
import teacherRoutes from './modules/teacher/teacher.routes';
import bookingRoutes from './modules/booking/booking.routes';
import roomRoutes from './modules/room/room.routes';
import siteRoutes from './modules/site/site.routes';
import { UPLOADS_DIR } from './lib/upload';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true, // refresh cookie için
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Yüklenen materyaller (geliştirme: yerel disk)
  app.use('/uploads', express.static(UPLOADS_DIR));

  app.use('/api/site', siteRoutes); // ana sayfa içeriği (herkese açık)
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/children', childrenRoutes);
  app.use('/api/teacher', teacherRoutes);
  app.use('/api/room', roomRoutes);
  app.use('/api', bookingRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

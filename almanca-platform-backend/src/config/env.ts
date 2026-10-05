import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL gerekli'),
  JWT_ACCESS_SECRET: z.string().min(10, 'JWT_ACCESS_SECRET çok kısa'),
  JWT_REFRESH_SECRET: z.string().min(10, 'JWT_REFRESH_SECRET çok kısa'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
  SEED_ADMIN_EMAIL: z.string().email().default('admin@platform.local'),
  SEED_ADMIN_NAME: z.string().default('Platform Admin'),
  // Daily.co — ders odası video altyapısı (opsiyonel: yoksa sunucu yine açılır,
  // yalnızca oda uçları çalışmaz)
  DAILY_API_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Ortam değişkenleri hatalı:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

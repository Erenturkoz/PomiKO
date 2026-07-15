import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { AppError } from './errors';

// Geliştirme: yerel disk. Üretimde KVKK için AB bölgesinde S3/R2 ile değiştirilecek.
export const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

export const uploadPdf = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new AppError(400, 'Yalnızca PDF yüklenebilir'));
  },
});

// Görsel yükleme (öğretmen fotoğrafı vb.)
export const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new AppError(400, 'Yalnızca JPG, PNG veya WebP yüklenebilir'));
  },
});

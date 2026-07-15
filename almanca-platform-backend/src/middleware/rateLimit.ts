import rateLimit from 'express-rate-limit';

// Giriş/parola denemeleri: kaba kuvvet ve kimlik doldurma (credential stuffing) saldırılarına karşı.
// Başarılı istekleri saymaz; yalnızca başarısızlar sınırı doldurur.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dk
  max: 10, // IP başına 15 dk'da en fazla 10 başarısız deneme
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla deneme yapıldı. Lütfen bir süre sonra tekrar dene.' },
});

// Kayıt: spam/sahte hesap üretimini sınırla
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 saat
  max: 5, // IP başına saatte en fazla 5 kayıt
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla kayıt denemesi. Lütfen daha sonra tekrar dene.' },
});

// Genel API için ölçülü bir tavan (aşırı otomatik trafiğe karşı)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

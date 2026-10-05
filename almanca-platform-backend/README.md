# Almanca Platform — Backend (Bölüm 1)

Canlı ders platformunun hesap + kimlik katmanı. Express + TypeScript + PostgreSQL + Prisma, JWT tabanlı kimlik doğrulama.

## Bu sürümde olanlar

- Veli kaydı / giriş / çıkış (JWT access + httpOnly refresh cookie, rotation'lı)
- Rol bazlı yetkilendirme: `PARENT`, `TEACHER`, `ADMIN`
- Admin'in öğretmen hesabı oluşturması (öğretmenler kendiliğinden kayıt olamaz)
- Velinin çocuk (alt) profili oluşturması + KVKK onay kaydı
- Bölüm 1'in tüm tabloları şemada hazır (ders slotları, rezervasyon, materyal — uçları sonraki adımda)

## Gereksinimler

- Node.js 18+
- PostgreSQL (lokal kurulu ve çalışır durumda)

## Kurulum

```bash
# 1) Bağımlılıklar
npm install

# 2) Ortam değişkenleri
cp .env.example .env
# .env içindeki DATABASE_URL ve JWT secret'larını kendine göre düzenle

# 3) Veritabanı tablolarını oluştur
npm run prisma:migrate    # ilk çalıştırmada migration adı sorar (örn. "init")

# 4) İlk admin'i oluştur
npm run seed

# 5) Sunucuyu başlat
npm run dev
```

Sunucu: `http://localhost:4000` — test: `GET http://localhost:4000/health`

## API uçları

| Yöntem | Yol | Rol | Açıklama |
|--------|-----|-----|----------|
| POST | `/api/auth/register` | herkes | Veli kaydı |
| POST | `/api/auth/login` | herkes | Giriş |
| POST | `/api/auth/refresh` | cookie | Access token yenile |
| POST | `/api/auth/logout` | cookie | Çıkış |
| GET | `/api/auth/me` | giriş | Mevcut kullanıcı |
| POST | `/api/admin/teachers` | ADMIN | Öğretmen hesabı oluştur |
| GET | `/api/admin/teachers` | ADMIN | Öğretmenleri listele |
| POST | `/api/children` | PARENT | Çocuk profili oluştur |
| GET | `/api/children` | PARENT | Çocuk profillerini listele |
| POST | `/api/children/:childId/consent` | PARENT | KVKK onayı kaydet |

## Hızlı test (curl)

```bash
# Veli kaydı
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"veli@test.com","password":"<PARENT_PASSWORD>","name":"Ayşe Veli"}'

# Dönen accessToken'ı kullanarak çocuk profili oluştur
curl -X POST http://localhost:4000/api/children \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{"name":"Ahmet","birthDate":"2014-05-01T00:00:00.000Z"}'

# Admin girişi → öğretmen oluştur
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<SEED_ADMIN_EMAIL>","password":"<SEED_ADMIN_PASSWORD>"}'

curl -X POST http://localhost:4000/api/admin/teachers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -d '{"email":"ogretmen@test.com","password":"<TEACHER_PASSWORD>","name":"Mehmet Öğretmen"}'
```

## Sonraki adım

Bu temelin üstüne sırayla: öğretmen müsaitlik/takvim yönetimi → rezervasyon akışı → Daily.co ders odası → PDF materyal. Ardından React arayüzleri.

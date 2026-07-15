# Almanca Platform — Frontend (Bölüm 1, Dilim 1)

Kayıt/giriş ekranları + role göre paneller. React + Vite + TypeScript, react-router. Backend'in hesap uçlarına bağlanır.

## Bu dilimde olanlar

- Veli kaydı ve giriş (JWT access token bellekte, refresh httpOnly cookie ile otomatik)
- Sayfa yenilense bile oturum korunur (açılışta sessiz refresh)
- Role göre yönlendirme: PARENT → veli paneli, TEACHER → öğretmen paneli, ADMIN → yönetici paneli
- Veli paneli: çocuk profili ekleme/listeleme + KVKK onayı
- Yönetici paneli: öğretmen oluşturma/listeleme
- Öğretmen paneli: bir sonraki dilim için yer tutucular (müsaitlik takvimi)

## Çalıştırma

Önce **backend çalışıyor olmalı** (`http://localhost:4000`).

```bash
npm install
cp .env.example .env     # gerekirse VITE_API_URL'i düzenle
npm run dev
```

Arayüz: `http://localhost:5173`

## Deneme akışı

1. `http://localhost:5173/register` → veli olarak kaydol → veli paneline düşersin → çocuk profili ekle, KVKK onayı ver.
2. Çıkış yap, admin ile giriş yap (`admin@platform.local` / seed parolası) → yönetici paneli → öğretmen oluştur.
3. Çıkış yap, oluşturduğun öğretmen e-posta + parolasıyla giriş yap → öğretmen paneli.

## Not

- Access token bilerek `localStorage`'da tutulmuyor (XSS'e karşı daha güvenli); sekme yenilenince refresh cookie ile oturum geri yükleniyor.
- Backend `CORS_ORIGIN` değeri bu arayüzün adresiyle (`http://localhost:5173`) aynı olmalı — varsayılan ayar zaten böyle.

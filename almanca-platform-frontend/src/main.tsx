import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './landing.css';
import { syncServerTime } from './lib/serverTime';

// Not: <StrictMode> bilerek kullanılmıyor. Geliştirme modundaki çift kurulum/yıkım,
// Daily video çerçevesinin bağlanmasını bozuyordu.
// Sunucu saatiyle hizalan (geri sayımlar buna göre çalışır), sonra uygulamayı başlat
syncServerTime().finally(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});

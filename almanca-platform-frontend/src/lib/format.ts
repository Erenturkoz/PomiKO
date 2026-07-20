import { now as serverNow } from './serverTime';
const dateFmt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' });
const timeFmt = new Intl.DateTimeFormat('tr-TR', { timeStyle: 'short' });

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

export function formatTimeRange(startIso: string, endIso: string): string {
  return `${dateFmt.format(new Date(startIso))} · ${timeFmt.format(new Date(startIso))}–${timeFmt.format(
    new Date(endIso)
  )}`;
}

// Tarih olmadan yalnızca saat aralığı — takvim ikonu + tarih, saat ikonu + bu ayrı ayrı gösterilirken kullanılır
export function formatTimeOnly(startIso: string, endIso: string): string {
  return `${timeFmt.format(new Date(startIso))}–${timeFmt.format(new Date(endIso))}`;
}

export function isPast(iso: string): boolean {
  return new Date(iso).getTime() <= serverNow();
}

export function minutesUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - serverNow()) / 60000);
}

export type JoinState = 'open' | 'future' | 'ended';

// Derse katılım durumu: başlangıçtan `opensMinBefore` dk önce açılır, bitince kapanır
// Ders ekranı (lobi) başlangıçtan 10 dk önce açılır
export function joinState(startIso: string, endIso: string, opensMinBefore = 10): JoinState {
  const now = serverNow();
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (now > end) return 'ended';
  if (now >= start - opensMinBefore * 60000) return 'open';
  return 'future';
}

export function opensAtIso(startIso: string, opensMinBefore = 10): string {
  return new Date(new Date(startIso).getTime() - opensMinBefore * 60000).toISOString();
}

// İnsan-okur geri sayım: "12 dk", "1 sa 5 dk"
export function humanCountdown(iso: string): string {
  const m = Math.max(0, minutesUntil(iso));
  if (m <= 0) return 'birazdan';
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} sa ${rem} dk` : `${h} sa`;
}

import { API_URL } from '../api/client';

/**
 * Sunucu saati ile tarayıcı saati arasındaki farkı tutar.
 * Kullanıcının bilgisayar saati yanlış (veya kasten değiştirilmiş) olabilir;
 * tüm geri sayımlar bu ofsetle düzeltilmiş saati kullanır.
 */
let offsetMs = 0;
let synced = false;

/** Sunucu saatine göre "şimdi" (ms) */
export function now(): number {
  return Date.now() + offsetMs;
}

export function isSynced(): boolean {
  return synced;
}

/** Sunucudan gelen bir zaman damgasıyla ofseti güncelle */
export function setServerNow(serverIso: string) {
  const server = new Date(serverIso).getTime();
  if (!Number.isFinite(server)) return;
  offsetMs = server - Date.now();
  synced = true;
}

/** Uygulama açılışında bir kez çağrılır */
export async function syncServerTime(): Promise<void> {
  try {
    const t0 = Date.now();
    const res = await fetch(`${API_URL}/api/site/time`);
    if (!res.ok) return;
    const data = await res.json();
    const t1 = Date.now();
    const server = new Date(data.now).getTime();
    if (!Number.isFinite(server)) return;
    // Gidiş-dönüş gecikmesinin yarısını ekleyerek daha isabetli hizala
    const latency = (t1 - t0) / 2;
    offsetMs = server + latency - t1;
    synced = true;
  } catch {
    /* sunucuya ulaşılamazsa yerel saatle devam edilir */
  }
}

import { env } from '../config/env';
import { AppError } from './errors';

const DAILY_API = 'https://api.daily.co/v1';

function requireKey(): string {
  if (!env.DAILY_API_KEY) {
    throw new AppError(503, 'Daily API anahtarı tanımlı değil (.env DAILY_API_KEY)');
  }
  return env.DAILY_API_KEY;
}

async function dailyFetch<T = any>(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${DAILY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireKey()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function dailyError(prefix: string, status: number, data: any): AppError {
  const detail = data?.info ?? data?.error ?? JSON.stringify(data);
  // Sunucu konsoluna tam ayrıntı (hata ayıklama için)
  console.error(`[Daily] ${prefix} — HTTP ${status}:`, data);
  return new AppError(502, `Daily: ${detail}`);
}

interface DailyRoom {
  name: string;
  url: string;
}

// Önce odayı getir; yoksa oluştur. expUnix verilirse oda o zaman otomatik silinir.
export async function ensureRoom(roomName: string, expUnix?: number): Promise<DailyRoom> {
  const roomProps: Record<string, unknown> = {
    enable_screenshare: true,
    enable_prejoin_ui: true, // katılmadan önce kamera/mikrofon kurulum ekranı
    max_participants: 3, // öğretmen + öğrenci (+ gizli gözlemci payı)
  };
  if (expUnix) roomProps.exp = expUnix; // odanın otomatik silineceği an

  const got = await dailyFetch<DailyRoom>(`/rooms/${roomName}`);
  if (got.ok) {
    await dailyFetch(`/rooms/${roomName}`, {
      method: 'POST',
      body: JSON.stringify({ properties: roomProps }),
    }).catch(() => undefined);
    return got.data as DailyRoom;
  }

  const created = await dailyFetch<DailyRoom>('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      name: roomName,
      privacy: 'private',
      properties: roomProps,
    }),
  });
  if (!created.ok) {
    throw dailyError('oda oluşturulamadı', created.status, created.data);
  }
  return created.data as DailyRoom;
}

interface TokenOptions {
  roomName: string;
  userName: string;
  role: string; // 'TEACHER' | 'PARENT' | 'ADMIN' — arayüzde kamera ayrımı için
  isOwner: boolean;
  ghost: boolean; // görünmez gözlemci (admin)
}

export async function createMeetingToken(opts: TokenOptions): Promise<string> {
  const permissions = opts.ghost
    ? { hasPresence: false, canSend: false }
    : { hasPresence: true, canSend: ['video', 'audio', 'screenVideo', 'screenAudio'] };

  const res = await dailyFetch<{ token: string }>('/meeting-tokens', {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        room_name: opts.roomName,
        user_name: opts.userName,
        user_id: opts.role,
        is_owner: opts.isOwner,
        permissions,
        exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 saat
      },
    }),
  });
  if (!res.ok) {
    throw dailyError('token üretilemedi', res.status, res.data);
  }
  return res.data.token as string;
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// Access token bellekte tutulur (localStorage'da değil — daha güvenli).
// Refresh token httpOnly cookie'de, otomatik gönderilir.
let accessToken: string | null = null;
let onAuthFailure: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function registerAuthFailureHandler(fn: () => void) {
  onAuthFailure = fn;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  code?: string;
  constructor(status: number, message: string, details?: unknown, code?: string) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

// Tek seferlik refresh (paralel istekler aynı refresh'i bekler)
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) return false;
        const data = await res.json();
        accessToken = data.accessToken;
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  // 401 sonrası refresh denenip tekrar gönderildiğinde sonsuz döngüyü engeller
  _retried?: boolean;
  // Sayfa kapanırken/yenilenirken de isteğin gönderilmeye devam etmesi için (ör. oturum temizliği)
  keepalive?: boolean;
}

export async function apiFetch<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    body: options.body ? JSON.stringify(options.body) : undefined,
    keepalive: options.keepalive,
  });

  // Access token süresi dolmuşsa: bir kez refresh dene, sonra tekrar gönder
  if (res.status === 401 && !options._retried) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiFetch<T>(path, { ...options, _retried: true });
    }
    setAccessToken(null);
    onAuthFailure?.();
    throw new ApiError(401, 'Oturum süresi doldu, tekrar giriş yapın');
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? 'İstek başarısız', data?.details, data?.code);
  }
  return data as T;
}

export { API_URL, tryRefresh };

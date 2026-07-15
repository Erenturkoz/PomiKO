import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  apiFetch,
  setAccessToken,
  registerAuthFailureHandler,
  tryRefresh,
  API_URL,
} from '../api/client';

export type Role = 'PARENT' | 'TEACHER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface ActiveChild {
  id: string;
  name: string;
  age: number | null;
  credits: number;
}

export interface Session {
  mode: 'account' | 'profile';
  child: ActiveChild | null;
}

export interface RegisterChild {
  name: string;
  age: number;
  birthDate?: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  phone: string;
  password: string;
  kvkkConsent: boolean;
  children: RegisterChild[];
}

interface AuthContextValue {
  user: User | null;
  session: Session;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  selectProfile: (childId: string) => Promise<void>;
  unlockAccount: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const DEFAULT_SESSION: Session = { mode: 'account', child: null };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session>(DEFAULT_SESSION);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    registerAuthFailureHandler(() => {
      setUser(null);
      setSession(DEFAULT_SESSION);
    });

    (async () => {
      const ok = await tryRefresh();
      if (ok) {
        try {
          const data = await apiFetch<{ user: User; session: Session }>('/api/auth/session');
          setUser(data.user);
          setSession(data.session ?? DEFAULT_SESSION);
        } catch {
          setUser(null);
        }
      }
      setLoading(false);
    })();
  }, []);

  async function login(email: string, password: string) {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? 'Giriş başarısız');
    setAccessToken(data.accessToken);
    setUser(data.user);
    setSession(data.session ?? DEFAULT_SESSION);
    return data.user as User;
  }

  async function register(input: RegisterInput) {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? 'Kayıt başarısız');
    setAccessToken(data.accessToken);
    setUser(data.user);
    setSession(data.session ?? DEFAULT_SESSION);
    return data.user as User;
  }

  async function selectProfile(childId: string) {
    const data = await apiFetch<{ accessToken: string; session: Session }>('/api/auth/profile/select', {
      method: 'POST',
      body: { childId },
    });
    setAccessToken(data.accessToken);
    setSession(data.session);
  }

  async function unlockAccount(password: string) {
    const data = await apiFetch<{ accessToken: string; session: Session }>('/api/auth/profile/unlock', {
      method: 'POST',
      body: { password },
    });
    setAccessToken(data.accessToken);
    setSession(data.session);
  }

  async function logout() {
    try {
      await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      setAccessToken(null);
      setUser(null);
      setSession(DEFAULT_SESSION);
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, session, loading, login, register, selectProfile, unlockAccount, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}

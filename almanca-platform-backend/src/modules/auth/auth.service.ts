import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { hashPassword, verifyPassword } from '../../lib/password';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshExpiryDate,
  signAccessToken,
  TokenScope,
} from '../../lib/jwt';
import { AppError } from '../../lib/errors';

const CONSENT_VERSION = 'kvkk-2026-01';

function publicUser(user: { id: string; email: string; name: string; role: Role }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

interface SessionState {
  mode: TokenScope;
  childId?: string | null;
}

// Oturum durumunu (mod + aktif çocuk bilgisi) istemciye döndürülebilir hale getir
async function publicSession(state: SessionState) {
  if (state.mode === 'profile' && state.childId) {
    const child = await prisma.childProfile.findUnique({
      where: { id: state.childId },
      select: { id: true, name: true, age: true, credits: true, avatarEmoji: true },
    });
    return { mode: 'profile' as const, child };
  }
  return { mode: 'account' as const, child: null };
}

async function issueTokens(user: { id: string; role: Role }, state: SessionState) {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    scope: state.mode,
    childId: state.mode === 'profile' ? state.childId ?? undefined : undefined,
  });
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashRefreshToken(refreshToken),
      userId: user.id,
      expiresAt: refreshExpiryDate(),
      mode: state.mode,
      childProfileId: state.mode === 'profile' ? state.childId ?? null : null,
    },
  });
  return { accessToken, refreshToken };
}

// Mevcut refresh kaydını bul (cookie'den), geçerliliğini doğrula
async function loadRefreshRecord(token: string | undefined) {
  if (!token) throw new AppError(401, 'Oturum bulunamadı');
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
    include: { user: true },
  });
  if (!record || record.revoked || record.expiresAt < new Date()) {
    throw new AppError(401, 'Geçersiz oturum');
  }
  return record;
}

export async function registerParent(input: {
  email: string;
  phone: string;
  password: string;
  name: string;
  children: { name: string; age: number; birthDate?: string }[];
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, 'Bu e-posta zaten kayıtlı');
  }
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: input.email,
        phone: input.phone,
        passwordHash,
        name: input.name,
        role: Role.PARENT,
      },
    });
    for (const c of input.children) {
      const child = await tx.childProfile.create({
        data: {
          parentUserId: u.id,
          name: c.name,
          age: c.age,
          birthDate: c.birthDate ? new Date(c.birthDate) : null,
        },
      });
      await tx.consent.create({
        data: { parentUserId: u.id, childProfileId: child.id, consentVersion: CONSENT_VERSION },
      });
    }
    return u;
  });

  const tokens = await issueTokens(user, { mode: 'account' });
  return { user: publicUser(user), session: await publicSession({ mode: 'account' }), ...tokens };
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError(401, 'E-posta veya parola hatalı');
  }
  const tokens = await issueTokens(user, { mode: 'account' });
  return { user: publicUser(user), session: await publicSession({ mode: 'account' }), ...tokens };
}

// Access token yenileme: refresh kaydındaki modu KORUR (profile ise profile döner)
export async function rotateRefresh(oldToken: string | undefined) {
  const record = await loadRefreshRecord(oldToken);
  const state: SessionState = { mode: record.mode as TokenScope, childId: record.childProfileId };
  await prisma.refreshToken.update({ where: { id: record.id }, data: { revoked: true } });
  const tokens = await issueTokens(record.user, state);
  return { user: publicUser(record.user), session: await publicSession(state), ...tokens };
}

// Çocuk profili seç (yalnızca hesap modundan). Refresh kaydını profile moduna alır.
export async function selectProfile(refreshToken: string | undefined, userId: string, childId: string) {
  const record = await loadRefreshRecord(refreshToken);
  if (record.userId !== userId) throw new AppError(403, 'Oturum uyuşmuyor');

  const child = await prisma.childProfile.findUnique({ where: { id: childId } });
  if (!child || child.parentUserId !== userId) {
    throw new AppError(404, 'Çocuk profili bulunamadı');
  }

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { mode: 'profile', childProfileId: child.id },
  });

  const state: SessionState = { mode: 'profile', childId: child.id };
  const accessToken = signAccessToken({
    sub: userId,
    role: record.user.role,
    scope: 'profile',
    childId: child.id,
  });
  return { accessToken, session: await publicSession(state) };
}

// Hesap moduna dön (parola ile). Refresh kaydını account moduna alır.
export async function unlockAccount(refreshToken: string | undefined, userId: string, password: string) {
  const record = await loadRefreshRecord(refreshToken);
  if (record.userId !== userId) throw new AppError(403, 'Oturum uyuşmuyor');
  if (!(await verifyPassword(password, record.user.passwordHash))) {
    throw new AppError(401, 'Parola hatalı');
  }

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { mode: 'account', childProfileId: null },
  });

  const accessToken = signAccessToken({ sub: userId, role: record.user.role, scope: 'account' });
  return { accessToken, session: await publicSession({ mode: 'account' }) };
}

export async function logout(token: string | undefined) {
  if (!token) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(token) },
    data: { revoked: true },
  });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'Kullanıcı bulunamadı');
  return publicUser(user);
}

// /session için: token'daki kapsam + çocuk bilgisi
export async function getSession(userId: string, scope: TokenScope, childId?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'Kullanıcı bulunamadı');
  return {
    user: publicUser(user),
    session: await publicSession({ mode: scope, childId: childId ?? null }),
  };
}

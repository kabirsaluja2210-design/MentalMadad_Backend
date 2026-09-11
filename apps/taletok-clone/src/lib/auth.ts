import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { db } from './db';

const COOKIE = 'rf_session';
const DAYS = 30;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error('AUTH_SECRET must be set to at least 16 characters');
  }
  return new TextEncoder().encode(value);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Creates a DB-backed session and returns the signed cookie value. */
export async function createSession(userId: string, userAgent?: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + DAYS * 86400_000);

  await db.session.create({ data: { userId, token, userAgent, expiresAt } });

  return new SignJWT({ sub: userId, jti: token })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${DAYS}d`)
    .sign(secret());
}

export async function setSessionCookie(jwt: string): Promise<void> {
  cookies().set(COOKIE, jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DAYS * 86400,
  });
}

export async function clearSession(): Promise<void> {
  const jwt = cookies().get(COOKIE)?.value;
  if (jwt) {
    try {
      const { payload } = await jwtVerify(jwt, secret());
      if (typeof payload.jti === 'string') {
        await db.session.deleteMany({ where: { token: payload.jti } });
      }
    } catch {
      /* already invalid — just drop the cookie */
    }
  }
  cookies().delete(COOKIE);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  workspaceId: string;
  workspaceName: string;
  credits: number;
  plan: string;
};

/** Resolves the signed-in user, or null. Safe to call from any server code. */
export async function currentUser(): Promise<SessionUser | null> {
  const jwt = cookies().get(COOKIE)?.value;
  if (!jwt) return null;

  let userId: string;
  let jti: string;
  try {
    const { payload } = await jwtVerify(jwt, secret());
    if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string') return null;
    userId = payload.sub;
    jti = payload.jti;
  } catch {
    return null;
  }

  // The JWT is only an envelope; the DB session row is the source of truth so
  // that logging out actually revokes access.
  const session = await db.session.findUnique({ where: { token: jti } });
  if (!session || session.userId !== userId || session.expiresAt < new Date()) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { workspace: true }, orderBy: { createdAt: 'asc' }, take: 1 } },
  });
  if (!user) return null;

  const membership = user.memberships[0];
  if (!membership) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    workspaceId: membership.workspaceId,
    workspaceName: membership.workspace.name,
    credits: membership.workspace.credits,
    plan: membership.workspace.plan,
  };
}

/** Same as currentUser() but throws — for API routes that require auth. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Not authenticated');
    this.name = 'UnauthorizedError';
  }
}

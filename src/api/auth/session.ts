import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createDb } from '../db';
import { createSession, deleteExpired, deleteSession, extendSession, findSession } from '../db/auth';
import type { AppEnv } from '../env';
import { windowCutoff } from './limits';

// Sessions: a random 32-byte token lives only in the browser's cookie; the database keeps its
// SHA-256, so a leaked database cannot be used to sign in. The cookie is __Host- prefixed,
// HttpOnly, Secure and SameSite=Lax, and lasts 30 days, renewed while the user keeps coming back.

const COOKIE = 'session'; // sent as __Host-session
const LIFETIME_SECONDS = 30 * 24 * 60 * 60;
/** Renew once less than this is left, so an active session never writes on every request. */
const RENEW_BELOW_SECONDS = 15 * 24 * 60 * 60;

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

async function sessionIdOf(token: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

function setSessionCookie(c: Context<AppEnv>, token: string) {
  setCookie(c, COOKIE, token, {
    prefix: 'host',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: LIFETIME_SECONDS,
  });
}

function clearSessionCookie(c: Context<AppEnv>) {
  deleteCookie(c, COOKIE, { prefix: 'host', path: '/', secure: true });
}

const expiryFrom = (now: Date) => new Date(now.getTime() + LIFETIME_SECONDS * 1000);

export async function startSession(c: Context<AppEnv>, userId: string) {
  const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  await createSession(createDb(c.env.DB), {
    id: await sessionIdOf(token),
    userId,
    expiresAt: expiryFrom(new Date()),
    userAgent: c.req.header('User-Agent')?.slice(0, 256) ?? null,
  });
  setSessionCookie(c, token);
}

export async function endSession(c: Context<AppEnv>) {
  const id = c.get('sessionId');
  if (id) await deleteSession(createDb(c.env.DB), id);
  clearSessionCookie(c);
}

/** Resolves the signed-in user from the cookie, renewing or discarding the session as needed. */
export const session: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('user', null);
  c.set('sessionId', null);

  const token = getCookie(c, COOKIE, 'host');
  if (token) {
    const db = createDb(c.env.DB);
    const id = await sessionIdOf(token);
    const found = await findSession(db, id);
    const now = new Date();

    if (!found || found.expiresAt <= now) {
      if (found) await deleteSession(db, id);
      clearSessionCookie(c);
    } else {
      if (found.expiresAt.getTime() - now.getTime() < RENEW_BELOW_SECONDS * 1000) {
        await extendSession(db, id, expiryFrom(now), now);
        setSessionCookie(c, token);
      }
      c.set('user', found.user);
      c.set('sessionId', id);
    }
  }

  await next();
};

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) return c.json({ error: 'unauthorized' }, 401);
  await next();
};

/** Daily housekeeping (cron): expired sessions and finished attempt windows. */
export async function cleanUpExpired(env: Env, now = new Date()) {
  await deleteExpired(createDb(env.DB), now, windowCutoff(now));
}

import { zValidator } from '@hono/zod-validator';
import { type Context, Hono } from 'hono';
import { loginInput, type Me, updateMeInput } from '../../shared/auth';
import { hashPassword, needsRehash, verifyPassword } from '../../shared/password';
import { LOGIN_WINDOW_SECONDS, MAX_FAILURES_PER_IP, MAX_FAILURES_PER_USERNAME, windowCutoff } from '../auth/limits';
import { endSession, requireUser, startSession } from '../auth/session';
import { createDb, type Db } from '../db';
import {
  clearFailures,
  findAccount,
  organizationsOf,
  recentFailures,
  recordFailures,
  type SessionUser,
  setLocale,
  setPasswordHash,
} from '../db/auth';
import type { AppEnv } from '../env';

async function meOf(db: Db, user: SessionUser): Promise<Me> {
  return {
    user: { id: user.id, username: user.username, fullName: user.fullName, locale: user.locale },
    organizations: await organizationsOf(db, user.id),
  };
}

const invalidRequest = (result: { success: boolean }, c: Context) => {
  if (!result.success) return c.json({ error: 'invalid_request' }, 400);
};

export const authRoutes = new Hono<AppEnv>()
  .post('/login', zValidator('json', loginInput, invalidRequest), async (c) => {
    const { username, password } = c.req.valid('json');
    const db = createDb(c.env.DB);
    const now = new Date();
    const cutoff = windowCutoff(now);
    const userKey = `user:${username.toLowerCase()}`;
    const ipKey = `ip:${c.req.header('CF-Connecting-IP') ?? 'unknown'}`;

    // Checked before the password, so a locked username stays locked even for the right
    // password, and a flood of guesses costs no hashing.
    const failures = await recentFailures(db, [userKey, ipKey], cutoff);
    for (const [key, limit] of [
      [userKey, MAX_FAILURES_PER_USERNAME],
      [ipKey, MAX_FAILURES_PER_IP],
    ] as const) {
      const window = failures.get(key);
      if (window && window.count >= limit) {
        const endsAt = window.windowStart.getTime() + LOGIN_WINDOW_SECONDS * 1000;
        c.header('Retry-After', String(Math.max(1, Math.ceil((endsAt - now.getTime()) / 1000))));
        return c.json({ error: 'too_many_attempts' }, 429);
      }
    }

    // Unknown usernames, wrong passwords and disabled accounts get the same answer in the same time.
    const account = await findAccount(db, username);
    const valid = await verifyPassword(password, account?.passwordHash ?? null);
    if (!account || !valid || account.status !== 'active') {
      await recordFailures(db, [userKey, ipKey], now, cutoff);
      return c.json({ error: 'invalid_credentials' }, 401);
    }

    if (failures.has(userKey)) await clearFailures(db, userKey);
    if (account.passwordHash && needsRehash(account.passwordHash)) {
      await setPasswordHash(db, account.id, await hashPassword(password));
    }
    await startSession(c, account.id);
    return c.json(await meOf(db, account));
  })
  .post('/logout', async (c) => {
    await endSession(c);
    return c.body(null, 204);
  });

export const meRoutes = new Hono<AppEnv>()
  .get('/', requireUser, async (c) => {
    const user = c.get('user') as SessionUser;
    return c.json(await meOf(createDb(c.env.DB), user));
  })
  // The user's own settings: today the interface language (#19).
  .patch('/', requireUser, zValidator('json', updateMeInput, invalidRequest), async (c) => {
    const user = c.get('user') as SessionUser;
    const { locale } = c.req.valid('json');
    const db = createDb(c.env.DB);
    await setLocale(db, user.id, locale);
    return c.json(await meOf(db, { ...user, locale }));
  });

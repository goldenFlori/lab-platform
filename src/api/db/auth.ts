import { and, eq, gt, inArray, lt, lte, sql } from 'drizzle-orm';
import type { Locale } from '../../shared/locale';
import type { Db } from './index';
import { loginAttempts, memberships, organizations, sessions, users } from './schema';

// Data access for signing in. Accounts and sessions belong to a person, not to a tenant, so this
// lives beside forTenant() rather than inside it.

export type SessionUser = { id: string; username: string; fullName: string; locale: Locale | null };

/** Unix seconds, as timestamp columns store them; raw SQL fragments need them spelled out. */
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

/** The account behind a username, with what sign-in needs to check it. */
export async function findAccount(db: Db, username: string) {
  const [account] = await db
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      locale: users.locale,
      passwordHash: users.passwordHash,
      status: users.status,
    })
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1);
  return account;
}

/** The user's interface language, or null to follow the course and the default (#19). */
export async function setLocale(db: Db, userId: string, locale: Locale | null) {
  await db.update(users).set({ locale }).where(eq(users.id, userId));
}

export async function setPasswordHash(db: Db, userId: string, passwordHash: string) {
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

/** The organizations a user belongs to, through any membership. */
export async function organizationsOf(db: Db, userId: string) {
  return db
    .selectDistinct({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, userId))
    .orderBy(organizations.name);
}

export async function createSession(
  db: Db,
  values: { id: string; userId: string; expiresAt: Date; userAgent: string | null },
) {
  await db.insert(sessions).values(values);
}

/** A session with its user, or undefined when it is missing or its user may no longer sign in. */
export async function findSession(db: Db, id: string) {
  const [row] = await db
    .select({
      id: sessions.id,
      expiresAt: sessions.expiresAt,
      user: { id: users.id, username: users.username, fullName: users.fullName, locale: users.locale },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), eq(users.status, 'active')))
    .limit(1);
  return row;
}

export async function extendSession(db: Db, id: string, expiresAt: Date, now: Date) {
  await db.update(sessions).set({ expiresAt, lastSeenAt: now }).where(eq(sessions.id, id));
}

export async function deleteSession(db: Db, id: string) {
  await db.delete(sessions).where(eq(sessions.id, id));
}

/** Failed attempts in the current window, per key; keys without one count as zero. */
export async function recentFailures(db: Db, keys: string[], windowStartAfter: Date) {
  const rows = await db
    .select({ key: loginAttempts.key, count: loginAttempts.count, windowStart: loginAttempts.windowStart })
    .from(loginAttempts)
    .where(and(inArray(loginAttempts.key, keys), gt(loginAttempts.windowStart, windowStartAfter)));
  return new Map(rows.map((r) => [r.key, r]));
}

/** Counts one failure for each key, starting a new window where the old one has ended. */
export async function recordFailures(db: Db, keys: string[], now: Date, windowStartAfter: Date) {
  const expired = sql`${loginAttempts.windowStart} <= ${seconds(windowStartAfter)}`;
  const [first, ...rest] = keys.map((key) =>
    db
      .insert(loginAttempts)
      .values({ key, windowStart: now, count: 1 })
      .onConflictDoUpdate({
        target: loginAttempts.key,
        set: {
          count: sql`case when ${expired} then 1 else ${loginAttempts.count} + 1 end`,
          windowStart: sql`case when ${expired} then ${seconds(now)} else ${loginAttempts.windowStart} end`,
        },
      }),
  );
  if (first) await db.batch([first, ...rest]);
}

export async function clearFailures(db: Db, key: string) {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
}

/** Daily housekeeping: drops expired sessions and finished attempt windows. */
export async function deleteExpired(db: Db, now: Date, windowStartAfter: Date) {
  await db.batch([
    db.delete(sessions).where(lt(sessions.expiresAt, now)),
    db.delete(loginAttempts).where(lte(loginAttempts.windowStart, windowStartAfter)),
  ]);
}

import { and, inArray, isNotNull, lt, type SQL, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { daysOf, RETENTION } from '../../shared/retention';
import { uuidv7 } from './ids';
import type { Db } from './index';
import {
  aiQuestions,
  aiUsage,
  deletionRequests,
  labActivity,
  liveSessions,
  memberships,
  organizations,
  predictionResults,
  users,
} from './schema';

// Platform-level operations, outside any tenant: for the platform owner's tools, seeding and
// tests. Route handlers that serve a tenant use forTenant() instead.

export async function createOrganization(db: Db, values: { name: string; slug: string }) {
  const [org] = await db
    .insert(organizations)
    .values({ ...values, id: uuidv7() })
    .returning();
  if (!org) throw new Error('The new organization could not be read back');
  return org;
}

/** Every institution with its counts, for the owner's console (#200): never a person's data. */
export async function institutionsWithCounts(db: Db, now = new Date()) {
  const weekAgo = new Date(now.getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
  return db.all<{
    id: string;
    name: string;
    slug: string;
    createdAt: number;
    courses: number;
    staff: number;
    students: number;
    activeThisWeek: number;
  }>(sql`
    SELECT o.id, o.name, o.slug, o.created_at AS createdAt,
      (SELECT COUNT(*) FROM courses c WHERE c.org_id = o.id) AS courses,
      (SELECT COUNT(DISTINCT m.user_id) FROM memberships m WHERE m.org_id = o.id AND m.role <> 'student') AS staff,
      (SELECT COUNT(DISTINCT m.user_id) FROM memberships m WHERE m.org_id = o.id AND m.role = 'student') AS students,
      (SELECT COUNT(DISTINCT a.user_id) FROM lab_activity a WHERE a.org_id = o.id AND a.day >= ${weekAgo}) AS activeThisWeek
    FROM organizations o
    ORDER BY o.created_at, o.name`);
}

export class TakenError extends Error {
  constructor(readonly what: 'slug' | 'username') {
    super(`${what} taken`);
  }
}

/**
 * A new institution with its first admin (#200), in one batch: the organization, the account and its
 * organization-wide admin membership. The password arrives hashed, made in the owner's browser.
 */
export async function createInstitutionWithAdmin(
  db: Db,
  input: { name: string; slug: string; admin: { fullName: string; username: string; passwordHash: string } },
) {
  const [slugTaken] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(sql`${organizations.slug} = ${input.slug}`);
  if (slugTaken) throw new TakenError('slug');
  const [nameTaken] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.username} = ${input.admin.username}`);
  if (nameTaken) throw new TakenError('username');
  const orgId = uuidv7();
  const userId = uuidv7();
  await db.batch([
    db.insert(organizations).values({ id: orgId, name: input.name, slug: input.slug }),
    db.insert(users).values({
      id: userId,
      username: input.admin.username,
      fullName: input.admin.fullName,
      passwordHash: input.admin.passwordHash,
    }),
    db.insert(memberships).values({ id: uuidv7(), orgId, userId, role: 'admin' }),
  ]);
  return { id: orgId, slug: input.slug };
}

/** At most this many rows of one table go per daily run, within D1's daily writes; the rest next day. */
export const RETENTION_BATCH = 5000;

const DAY_MS = 86_400_000;

/** Deletes up to `batch` of the table’s rows that match. */
function deleteSome(db: Db, table: SQLiteTable, where: SQL | undefined, batch: number) {
  return db
    .delete(table)
    .where(inArray(sql`rowid`, db.select({ rowid: sql`rowid` }).from(table).where(where).limit(batch)));
}

/**
 * The retention schedule (#116), run by the daily cron in every organization: what has passed its
 * period in RETENTION is deleted. Sessions and sign-in counters expire in auth (cleanUpExpired).
 */
export async function applyRetention(db: Db, now = new Date(), batch = RETENTION_BATCH) {
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const dayBefore = (days: number) => before(days).toISOString().slice(0, 10);
  const activity = daysOf(RETENTION.activityYears);
  await db.batch([
    deleteSome(db, aiQuestions, lt(aiQuestions.createdAt, before(RETENTION.aiQuestionDays)), batch),
    deleteSome(db, labActivity, lt(labActivity.day, dayBefore(activity)), batch),
    deleteSome(db, predictionResults, lt(predictionResults.day, dayBefore(activity)), batch),
    deleteSome(db, aiUsage, lt(aiUsage.day, dayBefore(activity)), batch),
    deleteSome(
      db,
      liveSessions,
      and(isNotNull(liveSessions.endedAt), lt(liveSessions.endedAt, before(activity))),
      batch,
    ),
    deleteSome(
      db,
      deletionRequests,
      and(
        isNotNull(deletionRequests.handledAt),
        lt(deletionRequests.handledAt, before(daysOf(RETENTION.handledRequestYears))),
      ),
      batch,
    ),
  ]);
}

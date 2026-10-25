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
  organizations,
  predictionResults,
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

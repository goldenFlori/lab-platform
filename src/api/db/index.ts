import { type SQL, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;

/**
 * Runs raw SQL statements as one D1 batch, all or nothing. Straight to D1: Drizzle 0.45's batch
 * cannot bind the parameters of raw SQL. Built queries (`.toSQL()`) may join them.
 */
export async function batchRaw(db: Db, statements: (SQL | { sql: string; params: unknown[] })[]) {
  const built = statements.map((s) => ('getSQL' in s ? db.run(s).getQuery() : s));
  await db.$client.batch(built.map((q) => db.$client.prepare(q.sql).bind(...q.params)));
}

/** True when the database answers a trivial query. */
export async function isDatabaseReachable(db: Db): Promise<boolean> {
  try {
    await db.run(sql`select 1`);
    return true;
  } catch (error) {
    console.error('Database check failed', error);
    return false;
  }
}

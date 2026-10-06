import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;

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

import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Conventions for every table:
// - ids are random text (UUIDv7), never sequential;
// - timestamps are Unix seconds, set by the database.

/** A tenant: a university, faculty or school. Every tenant-owned row points here. */
export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

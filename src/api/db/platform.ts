import { lt } from 'drizzle-orm';
import { uuidv7 } from './ids';
import type { Db } from './index';
import { aiQuestions, organizations } from './schema';

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

/** Students' AI questions are kept 180 days (#86), a semester and its exams; then deleted. */
export const AI_QUESTION_DAYS = 180;

export async function deleteOldAiQuestions(db: Db, now = new Date()) {
  await db
    .delete(aiQuestions)
    .where(lt(aiQuestions.createdAt, new Date(now.getTime() - AI_QUESTION_DAYS * 86_400_000)));
}

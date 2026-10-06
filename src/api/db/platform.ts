import { uuidv7 } from './ids';
import type { Db } from './index';
import { organizations } from './schema';

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

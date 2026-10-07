import { and, asc, eq } from 'drizzle-orm';
import type { Db } from './index';
import { memberships, organizations, roles } from './schema';

// Data access for permissions: which organization a request is about, and what the user's
// memberships there allow. Read per request, so permissions changed in the database apply at once.

export async function findOrganizationBySlug(db: Db, slug: string) {
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  return org;
}

/** One row per membership of the user in the organization, with the capabilities of its role. */
export async function grantsOf(db: Db, orgId: string, userId: string) {
  return db
    .select({ courseId: memberships.courseId, groupId: memberships.groupId, capabilities: roles.capabilities })
    .from(memberships)
    .innerJoin(roles, eq(roles.key, memberships.role))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
}

export async function listRoles(db: Db) {
  return db.select().from(roles).orderBy(asc(roles.position));
}

export async function roleExists(db: Db, key: string) {
  const [role] = await db.select({ key: roles.key }).from(roles).where(eq(roles.key, key)).limit(1);
  return role !== undefined;
}

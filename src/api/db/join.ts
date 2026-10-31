import { and, eq, isNull } from 'drizzle-orm';
import { uuidv7 } from './ids';
import type { Db } from './index';
import { courses, groups, memberships, organizations } from './schema';

// Joining a group with its code (#10). The code is the invitation, so this works across
// organizations by design: it is the one way into an organization without a pedagog adding you.

/** The group a code opens, unless joining is off or its course is archived. */
export async function findJoinableGroup(db: Db, code: string) {
  const [group] = await db
    .select({
      orgId: groups.orgId,
      orgSlug: organizations.slug,
      orgName: organizations.name,
      courseId: courses.id,
      courseTitle: courses.title,
      groupId: groups.id,
      groupName: groups.name,
    })
    .from(groups)
    .innerJoin(courses, and(eq(courses.id, groups.courseId), eq(courses.orgId, groups.orgId)))
    .innerJoin(organizations, eq(organizations.id, groups.orgId))
    .where(and(eq(groups.joinCode, code), isNull(courses.archivedAt)))
    .limit(1);
  return group;
}

/** Makes the user a student of the group; joining twice changes nothing. */
export async function addStudent(db: Db, values: { orgId: string; groupId: string; userId: string }) {
  await db
    .insert(memberships)
    .values({ ...values, id: uuidv7(), role: 'student' })
    .onConflictDoNothing();
}

/**
 * The branding of the institution a join code belongs to (#201), for the sign-in page that code leads
 * to: the code is the invitation, so it may show whose. Nothing for a code that joins nothing.
 */
export async function brandingByJoinCode(db: Db, code: string) {
  const [row] = await db
    .select({
      name: organizations.name,
      accent: organizations.accent,
      logo: organizations.logo,
      logoType: organizations.logoType,
      logoVersion: organizations.logoVersion,
      locale: organizations.locale,
      aiAllowed: organizations.aiAllowed,
    })
    .from(groups)
    .innerJoin(courses, and(eq(courses.id, groups.courseId), eq(courses.orgId, groups.orgId)))
    .innerJoin(organizations, eq(organizations.id, groups.orgId))
    .where(and(eq(groups.joinCode, code), isNull(courses.archivedAt)))
    .limit(1);
  return row;
}

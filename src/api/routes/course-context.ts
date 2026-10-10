import type { Context } from 'hono';
import type { CourseSummary } from '../../shared/courses';
import type { Access, TenantEnv } from '../auth/access';
import { NotFoundError } from '../db/tenant';

// Shared by the course, group and lab routes: find the course in the URL as the user may see it.
// A course you cannot see answers 404; one you can see but may not change answers 403.

type Course = { id: string; title: string; academicYear: string; archivedAt: Date | null };

export const summary = (course: Course): CourseSummary => ({
  id: course.id,
  title: course.title,
  academicYear: course.academicYear,
  archivedAt: course.archivedAt?.toISOString() ?? null,
});

/** Staff of the course, or a student of one of its groups. */
export function seesCourse(access: Access, courseId: string, groupIds: readonly string[]) {
  return access.canInCourse('lab.view', courseId, groupIds) || access.canInCourse('course.manage', courseId, groupIds);
}

export const invalidRequest = (result: { success: boolean }, c: Context) => {
  if (!result.success) return c.json({ error: 'invalid_request' }, 400);
};

export const forbidden = (c: Context) => c.json({ error: 'forbidden' }, 403);

/** The course in the URL and its groups, or NotFoundError when it is missing or hidden from the user. */
export async function visibleCourse(c: Context<TenantEnv>) {
  const { tenant, access } = c.var;
  const courseId = c.req.param('courseId') ?? '';
  const course = await tenant.courses.get(courseId);
  const groups = course ? await tenant.groups.ofCourse(course.id) : [];
  if (
    !course ||
    !seesCourse(
      access,
      course.id,
      groups.map((g) => g.id),
    )
  )
    throw new NotFoundError();
  return { course, groups };
}

/** A group of the course in the URL. */
export function groupOf<G extends { id: string }>(c: Context<TenantEnv>, groups: G[]) {
  const group = groups.find((g) => g.id === c.req.param('groupId'));
  if (!group) throw new NotFoundError();
  return group;
}

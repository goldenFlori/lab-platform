import { zValidator } from '@hono/zod-validator';
import { type Context, Hono } from 'hono';
import {
  type CourseDetail,
  type CourseSummary,
  createCourseInput,
  groupInput,
  joinCodeSwitchInput,
  updateCourseInput,
} from '../../shared/courses';
import { generateJoinCode } from '../../shared/join-code';
import type { Access, TenantEnv } from '../auth/access';
import { NotFoundError } from '../db/tenant';

// Courses and their groups, under /api/orgs/:org/courses (#10).
// A course you cannot see answers 404; one you can see but may not change answers 403.

type Course = { id: string; title: string; academicYear: string; archivedAt: Date | null };

const summary = (course: Course): CourseSummary => ({
  id: course.id,
  title: course.title,
  academicYear: course.academicYear,
  archivedAt: course.archivedAt?.toISOString() ?? null,
});

/** Staff of the course, or a student of one of its groups. */
function seesCourse(access: Access, courseId: string, groupIds: readonly string[]) {
  return access.canInCourse('lab.view', courseId, groupIds) || access.canInCourse('course.manage', courseId, groupIds);
}

const invalidRequest = (result: { success: boolean }, c: Context) => {
  if (!result.success) return c.json({ error: 'invalid_request' }, 400);
};

const forbidden = (c: Context) => c.json({ error: 'forbidden' }, 403);

/** The course in the URL and its groups, or NotFoundError when it is missing or hidden from the user. */
async function visibleCourse(c: Context<TenantEnv>) {
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
function groupOf(c: Context<TenantEnv>, groups: { id: string; name: string; joinCode: string | null }[]) {
  const group = groups.find((g) => g.id === c.req.param('groupId'));
  if (!group) throw new NotFoundError();
  return group;
}

export const courseRoutes = new Hono<TenantEnv>()
  .get('/', async (c) => {
    const { tenant, access } = c.var;
    const [courses, groups] = await Promise.all([tenant.courses.list(), tenant.groups.list()]);
    const visible = courses
      .filter((course) =>
        seesCourse(
          access,
          course.id,
          groups.filter((g) => g.courseId === course.id).map((g) => g.id),
        ),
      )
      // Current courses first, the newest year first.
      .sort(
        (a, b) =>
          Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
          b.academicYear.localeCompare(a.academicYear) ||
          a.title.localeCompare(b.title),
      );
    return c.json(visible.map(summary));
  })

  .post('/', zValidator('json', createCourseInput, invalidRequest), async (c) => {
    const { tenant, access } = c.var;
    if (!access.can('course.create')) return forbidden(c);
    const { copyFromCourseId, ...values } = c.req.valid('json');
    if (copyFromCourseId) {
      const source = await tenant.courses.get(copyFromCourseId);
      const groups = source ? await tenant.groups.ofCourse(source.id) : [];
      if (
        !source ||
        !seesCourse(
          access,
          source.id,
          groups.map((g) => g.id),
        )
      )
        throw new NotFoundError();
    }
    const course = await tenant.courses.createFor(c.var.user?.id as string, values, copyFromCourseId);
    return c.json(summary(course), 201);
  })

  .get('/:courseId', async (c) => {
    const { access } = c.var;
    const { course, groups } = await visibleCourse(c);
    return c.json({
      course: summary(course),
      groups: groups
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((group) => {
          const manageStudents = access.can('student.manage', { courseId: course.id, groupId: group.id });
          return {
            id: group.id,
            name: group.name,
            ...(manageStudents ? { joinCode: group.joinCode } : {}),
            permissions: { manageStudents },
          };
        }),
      permissions: { manage: access.can('course.manage', { courseId: course.id }) },
    } satisfies CourseDetail);
  })

  .patch('/:courseId', zValidator('json', updateCourseInput, invalidRequest), async (c) => {
    const { course } = await visibleCourse(c);
    if (!c.var.access.can('course.manage', { courseId: course.id })) return forbidden(c);
    const updated = await c.var.tenant.courses.update(course.id, c.req.valid('json'));
    return c.json(summary(updated ?? course));
  })

  // Archiving ends the year: the course stays readable, but its join codes stop working.
  .post('/:courseId/archive', async (c) => {
    const { course } = await visibleCourse(c);
    if (!c.var.access.can('course.manage', { courseId: course.id })) return forbidden(c);
    const updated = await c.var.tenant.courses.update(course.id, { archivedAt: course.archivedAt ?? new Date() });
    return c.json(summary(updated ?? course));
  })

  .post('/:courseId/unarchive', async (c) => {
    const { course } = await visibleCourse(c);
    if (!c.var.access.can('course.manage', { courseId: course.id })) return forbidden(c);
    const updated = await c.var.tenant.courses.update(course.id, { archivedAt: null });
    return c.json(summary(updated ?? course));
  })

  .post('/:courseId/groups', zValidator('json', groupInput, invalidRequest), async (c) => {
    const { course } = await visibleCourse(c);
    if (!c.var.access.can('course.manage', { courseId: course.id })) return forbidden(c);
    const group = await c.var.tenant.groups.create({
      courseId: course.id,
      name: c.req.valid('json').name,
      joinCode: generateJoinCode(),
    });
    return c.json(
      { id: group.id, name: group.name, joinCode: group.joinCode, permissions: { manageStudents: true } },
      201,
    );
  })

  .patch('/:courseId/groups/:groupId', zValidator('json', groupInput, invalidRequest), async (c) => {
    const { course, groups } = await visibleCourse(c);
    const group = groupOf(c, groups);
    if (!c.var.access.can('course.manage', { courseId: course.id })) return forbidden(c);
    await c.var.tenant.groups.update(group.id, { name: c.req.valid('json').name });
    return c.body(null, 204);
  })

  .delete('/:courseId/groups/:groupId', async (c) => {
    const { course, groups } = await visibleCourse(c);
    const group = groupOf(c, groups);
    if (!c.var.access.can('course.manage', { courseId: course.id })) return forbidden(c);
    await c.var.tenant.groups.remove(group.id);
    return c.body(null, 204);
  })

  // A new code (the old one stops working at once), or none: joining is switched off.
  .post('/:courseId/groups/:groupId/join-code', zValidator('json', joinCodeSwitchInput, invalidRequest), async (c) => {
    const { course, groups } = await visibleCourse(c);
    const group = groupOf(c, groups);
    if (!c.var.access.can('student.manage', { courseId: course.id, groupId: group.id })) return forbidden(c);
    const joinCode = c.req.valid('json').enabled ? generateJoinCode() : null;
    await c.var.tenant.groups.update(group.id, { joinCode });
    return c.json({ joinCode });
  });

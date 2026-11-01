import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  type CourseDetail,
  createCourseInput,
  groupInput,
  joinCodeSwitchInput,
  updateCourseInput,
} from '../../shared/courses';
import { generateJoinCode } from '../../shared/join-code';
import { type CourseShareView, copyShareInput, shareInput } from '../../shared/sharing';
import { type GroupStudent, importStudentsInput, resetPasswordInput } from '../../shared/students';
import type { TenantEnv } from '../auth/access';
import { createDb } from '../db';
import { copiesOf, copyCourse, findShare } from '../db/sharing';
import { NotFoundError } from '../db/tenant';
import { courseActivityRoutes, pilotReportRoutes, understandingRoutes } from './activity';
import { aiRoutes } from './ai';
import { forbidden, groupOf, invalidRequest, seesCourse, summary, visibleCourse } from './course-context';
import { courseGradesRoutes } from './grading';
import { labRoutes } from './labs';
import { progressRoutes, reviewRoutes } from './progress';
import { searchRoutes } from './search';
import { staffRoutes } from './staff';
import { surveyRoutes } from './surveys';

// Courses and their groups, under /api/orgs/:org/courses (#10).

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
    const creatorId = c.var.user?.id as string;
    if (!copyFromCourseId) return c.json(summary(await tenant.courses.createFor(creatorId, values)), 201);

    // A new term from a course of this institution (#210): everything staff made in it, solutions and
    // grading too if the creator may see them; never its groups, people, visibility or work.
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
    const id = await copyCourse(
      createDb(c.env.DB),
      {
        orgId: c.var.organization.id,
        courseId: source.id,
        title: source.title,
        academicYear: source.academicYear,
        institution: c.var.organization.name,
        solutions: access.can('solution.view', { courseId: source.id }),
        templateId: source.templateId,
      },
      { ...values, orgId: c.var.organization.id, creatorId },
    );
    const course = await tenant.courses.get(id);
    if (!course) throw new Error('The copied course could not be read back');
    return c.json(summary(course), 201);
  })

  // A copy of a course another institution shares (#203), as a new course here with its creator as
  // pedagog. The share's token is the author's permission; course.create here is the copier's.
  .post('/from-share', zValidator('json', copyShareInput, invalidRequest), async (c) => {
    if (!c.var.access.can('course.create')) return forbidden(c);
    const { token, ...values } = c.req.valid('json');
    const db = createDb(c.env.DB);
    const share = await findShare(db, token);
    if (!share) throw new NotFoundError();
    const id = await copyCourse(db, share, {
      ...values,
      orgId: c.var.organization.id,
      creatorId: c.var.user?.id as string,
    });
    const course = await c.var.tenant.courses.get(id);
    if (!course) throw new Error('The copied course could not be read back');
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
      permissions: {
        manage: access.can('course.manage', { courseId: course.id }),
        analytics: access.canInCourse(
          'analytics.view',
          course.id,
          groups.map((g) => g.id),
        ),
        configureAi: access.can('ai.configure', { courseId: course.id }),
        grades: access.canInCourse(
          'grade.edit',
          course.id,
          groups.map((g) => g.id),
        ),
        solutions: access.can('solution.view', { courseId: course.id }),
      },
    } satisfies CourseDetail);
  })

  .patch('/:courseId', zValidator('json', updateCourseInput, invalidRequest), async (c) => {
    const { course } = await visibleCourse(c);
    if (!c.var.access.can('course.manage', { courseId: course.id })) return forbidden(c);
    const { ai, ...changes } = c.req.valid('json');
    if (ai !== undefined && !c.var.access.can('ai.configure', { courseId: course.id })) return forbidden(c);
    // The institution may not allow AI at all (#202).
    if (ai && !(await c.var.tenant.branding.get())?.aiAllowed) return c.json({ error: 'ai_not_allowed' }, 409);
    const updated = await c.var.tenant.courses.update(course.id, {
      ...changes,
      ...(ai === undefined ? {} : { aiEnabled: ai }),
    });
    return c.json(summary(updated ?? course));
  })

  // Deleting removes the course with everything in it: groups, labs, notebooks, students' code,
  // submissions, grades and activity (the database cascades). Accounts stay (#80).
  .delete('/:courseId', async (c) => {
    const { course } = await visibleCourse(c);
    if (!c.var.access.can('course.manage', { courseId: course.id })) return forbidden(c);
    await c.var.tenant.courses.remove(course.id);
    return c.body(null, 204);
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

  // Sharing the course with other institutions (#203): its link, and the institutions that copied it.
  .get('/:courseId/share', async (c) => {
    const { course } = await visibleCourse(c);
    if (!c.var.access.can('course.manage', { courseId: course.id })) return forbidden(c);
    return c.json(await shareView(c.env.DB, course.id, await c.var.tenant.shares.ofCourse(course.id)));
  })

  // Solutions go with the copy only if the one sharing may see them.
  .put('/:courseId/share', zValidator('json', shareInput, invalidRequest), async (c) => {
    const { course } = await visibleCourse(c);
    if (!c.var.access.can('course.manage', { courseId: course.id })) return forbidden(c);
    const { solutions } = c.req.valid('json');
    if (solutions && !c.var.access.can('solution.view', { courseId: course.id })) return forbidden(c);
    return c.json(await shareView(c.env.DB, course.id, await c.var.tenant.shares.set(course.id, solutions)));
  })

  .delete('/:courseId/share', async (c) => {
    const { course } = await visibleCourse(c);
    if (!c.var.access.can('course.manage', { courseId: course.id })) return forbidden(c);
    await c.var.tenant.shares.stop(course.id);
    return c.body(null, 204);
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

  .get('/:courseId/groups/:groupId/students', async (c) => {
    const { course, groups } = await visibleCourse(c);
    const group = groupOf(c, groups);
    if (!c.var.access.can('student.manage', { courseId: course.id, groupId: group.id })) return forbidden(c);
    return c.json((await c.var.tenant.students.ofGroup(group.id)) satisfies GroupStudent[]);
  })

  // Up to 25 students per request; the browser sends a long list in several. Only hashes arrive.
  .post('/:courseId/groups/:groupId/students', zValidator('json', importStudentsInput, invalidRequest), async (c) => {
    const { course, groups } = await visibleCourse(c);
    const group = groupOf(c, groups);
    if (!c.var.access.can('student.manage', { courseId: course.id, groupId: group.id })) return forbidden(c);
    const students = await c.var.tenant.students.importInto(group.id, c.req.valid('json').students);
    return c.json({ students: students satisfies GroupStudent[] }, 201);
  })

  .post(
    '/:courseId/groups/:groupId/students/:userId/password',
    zValidator('json', resetPasswordInput, invalidRequest),
    async (c) => {
      const { course, groups } = await visibleCourse(c);
      const group = groupOf(c, groups);
      if (!c.var.access.can('student.manage', { courseId: course.id, groupId: group.id })) return forbidden(c);
      await c.var.tenant.students.setPassword(group.id, c.req.param('userId'), c.req.valid('json').passwordHash);
      return c.body(null, 204);
    },
  )

  // A new code (the old one stops working at once), or none: joining is switched off.
  .post('/:courseId/groups/:groupId/join-code', zValidator('json', joinCodeSwitchInput, invalidRequest), async (c) => {
    const { course, groups } = await visibleCourse(c);
    const group = groupOf(c, groups);
    if (!c.var.access.can('student.manage', { courseId: course.id, groupId: group.id })) return forbidden(c);
    const joinCode = c.req.valid('json').enabled ? generateJoinCode() : null;
    await c.var.tenant.groups.update(group.id, { joinCode });
    return c.json({ joinCode });
  })

  .route('/:courseId/staff', staffRoutes)
  .route('/:courseId/labs', labRoutes)
  .route('/:courseId/search', searchRoutes)
  .route('/:courseId/activity', courseActivityRoutes)
  .route('/:courseId/understanding', understandingRoutes)
  .route('/:courseId/ai', aiRoutes)
  .route('/:courseId/grades', courseGradesRoutes)
  .route('/:courseId/progress', progressRoutes)
  .route('/:courseId/review', reviewRoutes)
  .route('/:courseId/report', pilotReportRoutes)
  .route('/:courseId/survey', surveyRoutes);

async function shareView(
  binding: D1Database,
  courseId: string,
  share: { token: string; solutions: boolean } | undefined,
): Promise<CourseShareView> {
  const copies = await copiesOf(createDb(binding), courseId);
  return {
    share: share ? { token: share.token, solutions: share.solutions } : null,
    copies: copies.map((copy) => ({ ...copy, copiedAt: copy.copiedAt.toISOString() })),
  };
}

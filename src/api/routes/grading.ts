import { zValidator } from '@hono/zod-validator';
import { type Context, Hono } from 'hono';
import { type GradeResult, gradeReviewInput, gradeRunInput, gradingInput, type StaffGrade } from '../../shared/grading';
import type { TenantEnv } from '../auth/access';
import { NotFoundError } from '../db/tenant';
import { forbidden, invalidRequest } from './course-context';
import { type LabContext, notebookInUrl } from './lab-context';

// Grading on the pedagog's machine (#53), under …/labs/:labId/notebooks/:notebookId.
//
// Staff with grade.edit set each exercise's points and hidden test, take a group's submissions,
// re-run them in their own browser and store the grades here; the server never runs Python, and
// a student's own browser never writes a grade. Hidden tests and unreleased grades reach staff
// only; a student sees their own grade once it is released (GET …/submission).

/** The course's groups in which this user may grade. */
const gradingGroups = (c: Context<TenantEnv>, ctx: LabContext) =>
  ctx.groups.filter((g) => c.var.access.can('grade.edit', { courseId: ctx.course.id, groupId: g.id }));

/** The group in the query, if this user may grade it; else 403. */
function groupInQuery(c: Context<TenantEnv>, ctx: LabContext) {
  const group = c.req.query('group') ?? '';
  return gradingGroups(c, ctx).some((g) => g.id === group) ? group : null;
}

/** The student in the URL, if they belong to a group this user may grade; else 404. */
async function gradedStudent(c: Context<TenantEnv>, ctx: LabContext) {
  const userId = c.req.param('userId') ?? '';
  const groups = gradingGroups(c, ctx).map((g) => g.id);
  if (!groups.length) return null;
  if (!(await c.var.tenant.submissions.isStudentOf(userId, groups))) throw new NotFoundError();
  return userId;
}

const staffGrade = (row: {
  userId: string;
  autoScore: number;
  maxScore: number;
  results: { cell: number; status: string }[];
  score: number | null;
  feedback: string | null;
  gradedAt: Date;
  releasedAt: Date | null;
}): StaffGrade => ({
  userId: row.userId,
  autoScore: row.autoScore,
  maxScore: row.maxScore,
  results: row.results as GradeResult[],
  score: row.score,
  feedback: row.feedback,
  gradedAt: row.gradedAt.toISOString(),
  releasedAt: row.releasedAt?.toISOString() ?? null,
});

export const gradingRoutes = new Hono<TenantEnv>()
  // Points and hidden tests, for staff who grade.
  .get('/grading', async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    if (!gradingGroups(c, ctx).length) return forbidden(c);
    return c.json({ exercises: await c.var.tenant.grading.setupOf(nb.id) });
  })

  // They apply to every group, so changing them needs grade.edit for the whole course.
  .put('/grading', zValidator('json', gradingInput, invalidRequest), async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    if (!c.var.access.can('grade.edit', { courseId: ctx.course.id })) return forbidden(c);
    await c.var.tenant.grading.setSetup(nb.id, c.req.valid('json').exercises);
    return c.json({ exercises: await c.var.tenant.grading.setupOf(nb.id) });
  })

  // A group's submissions with their code, for the batch run.
  .get('/grading/submissions', async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const group = groupInQuery(c, ctx);
    if (!group) return forbidden(c);
    const students = await c.var.tenant.submissions.ofGroup(nb.id, group);
    const handedIn = await Promise.all(
      students.filter((s) => s.submittedAt).map((s) => c.var.tenant.submissions.of(nb.id, s.id)),
    );
    return c.json({
      submissions: handedIn.flatMap((row) => (row ? [{ userId: row.userId, code: row.code }] : [])),
    });
  })

  // A group's grades.
  .get('/grades', async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const group = groupInQuery(c, ctx);
    if (!group) return forbidden(c);
    const students = await c.var.tenant.students.ofGroup(group);
    const rows = await c.var.tenant.grading.ofNotebook(
      nb.id,
      students.map((s) => s.id),
    );
    return c.json({ grades: rows.map(staffGrade) });
  })

  // One student's re-run result.
  .put('/grades/:userId', zValidator('json', gradeRunInput, invalidRequest), async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const userId = await gradedStudent(c, ctx);
    if (!userId) return forbidden(c);
    await c.var.tenant.grading.record({ notebookId: nb.id, userId, ...c.req.valid('json') });
    const row = await c.var.tenant.grading.of(nb.id, userId);
    return c.json(row ? staffGrade(row) : null);
  })

  // The pedagog's score and feedback.
  .patch('/grades/:userId', zValidator('json', gradeReviewInput, invalidRequest), async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const userId = await gradedStudent(c, ctx);
    if (!userId) return forbidden(c);
    if (!(await c.var.tenant.grading.review(nb.id, userId, c.req.valid('json')))) throw new NotFoundError();
    const row = await c.var.tenant.grading.of(nb.id, userId);
    return c.json(row ? staffGrade(row) : null);
  })

  // Shows the group's students their grades.
  .post('/grades/release', async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const group = groupInQuery(c, ctx);
    if (!group) return forbidden(c);
    const students = await c.var.tenant.students.ofGroup(group);
    await c.var.tenant.grading.release(
      nb.id,
      students.map((s) => s.id),
    );
    return c.body(null, 204);
  });

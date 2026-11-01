import { zValidator } from '@hono/zod-validator';
import { type Context, Hono } from 'hono';
import {
  type AssessmentReport,
  type ExerciseReport,
  MIN_REPORT_STUDENTS,
  traceRows,
} from '../../shared/assessment-report';
import {
  type CourseGrades,
  type GradeResult,
  gradeReviewInput,
  gradeRunInput,
  gradingInput,
  type StaffGrade,
} from '../../shared/grading';
import { scoreTrace, type TraceScore, tracePoints, traceProblemFor } from '../../shared/trace-grading';
import { variantIssue } from '../../shared/trace-problem';
import type { TenantEnv } from '../auth/access';
import { NotFoundError } from '../db/tenant';
import { forbidden, invalidRequest } from './course-context';
import { type LabContext, labContext, notebookInUrl } from './lab-context';

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
  traces: TraceScore[];
  score: number | null;
  feedback: string | null;
  comments: { cell: number; text: string }[] | null;
  gradedAt: Date;
  releasedAt: Date | null;
}): StaffGrade => ({
  userId: row.userId,
  autoScore: row.autoScore,
  maxScore: row.maxScore,
  results: row.results as GradeResult[],
  traces: row.traces,
  score: row.score,
  feedback: row.feedback,
  comments: row.comments ?? [],
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
    // The browser's run scores the code; the server scores the trace tables itself (#168).
    const run = c.req.valid('json');
    const [embeds, handed] = await Promise.all([
      c.var.tenant.notebooks.embedsOf(nb.id),
      c.var.tenant.submissions.tracesOf(nb.id, userId),
    ]);
    const traces: TraceScore[] = embeds
      .filter((e) => e.viz === 'tabela-gjurmimit' && tracePoints(e.props) > 0)
      .map((e) => {
        const problem = traceProblemFor(e.props, { userId, notebookId: nb.id, cell: e.cell });
        const answers = handed.find((t) => t.cell === e.cell)?.rows ?? [];
        return { cell: e.cell, ...scoreTrace(problem, answers, tracePoints(e.props)) };
      });
    await c.var.tenant.grading.record({
      notebookId: nb.id,
      userId,
      autoScore: run.autoScore + traces.reduce((n, t) => n + t.score, 0),
      maxScore: run.maxScore + traces.reduce((n, t) => n + t.points, 0),
      results: run.results,
      traces,
    });
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

  // The assessment report (#170): how a group, or all the user reviews, did on each exercise and
  // each trace table row. Counts only, from MIN_REPORT_STUDENTS up.
  .get('/report', async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const reviewed = ctx.groups
      .filter((g) => c.var.access.can('submission.review', { courseId: ctx.course.id, groupId: g.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!reviewed.length) return forbidden(c);
    const group = c.req.query('group') || null;
    if (group && !reviewed.some((g) => g.id === group)) return forbidden(c);
    const groupIds = group ? [group] : reviewed.map((g) => g.id);
    const [rows, embeds, exercises] = await Promise.all([
      c.var.tenant.submissions.forReport(nb.id, groupIds),
      c.var.tenant.notebooks.embedsOf(nb.id),
      c.var.tenant.exercises.of(nb.id),
    ]);
    const once = <T extends { userId: string }>(list: T[]) => [
      ...new Map(list.map((row) => [row.userId, row])).values(),
    ];
    const handedIn = once(rows.handedIn);
    const graded = once(rows.graded);

    let exerciseReport: ExerciseReport[] | null = null;
    if (graded.length >= MIN_REPORT_STUDENTS) {
      const cells = [...new Set(graded.flatMap((g) => g.results.map((r) => r.cell)))].sort((a, b) => a - b);
      exerciseReport = cells.map((cell) => {
        const counts = { pass: 0, fail: 0, error: 0, todo: 0 };
        for (const g of graded) {
          const status = g.results.find((r) => r.cell === cell)?.status;
          if (status && status in counts) counts[status as keyof typeof counts]++;
        }
        return { cell, title: exercises.find((e) => e.cell === cell)?.title ?? '', ...counts };
      });
    }

    const traces =
      handedIn.length >= MIN_REPORT_STUDENTS
        ? embeds
            .filter((e) => e.viz === 'tabela-gjurmimit' && tracePoints(e.props) > 0)
            .map((e) => {
              const variant = variantIssue(e.props?.variant) === null;
              const answers = handedIn.map((h) => ({
                problem: traceProblemFor(e.props, { userId: h.userId, notebookId: nb.id, cell: e.cell }),
                rows: h.traces.find((t) => t.cell === e.cell)?.rows ?? [],
              }));
              return {
                cell: e.cell,
                title: e.title ?? null,
                points: tracePoints(e.props),
                variant,
                students: answers.length,
                rows: traceRows(answers, variant),
              };
            })
        : null;

    return c.json({
      groups: reviewed.map((g) => ({ id: g.id, name: g.name })),
      group,
      students: new Set(rows.students.map((s) => s.userId)).size,
      handedIn: handedIn.length,
      graded: graded.length,
      exercises: exerciseReport,
      traces,
    } satisfies AssessmentReport);
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

// A course's released grades (#114), under /api/orgs/:org/courses/:courseId/grades: every notebook
// and every student of the groups this user grades, for the CSV the pedagog takes to the records.
export const courseGradesRoutes = new Hono<TenantEnv>().get('/', async (c) => {
  const ctx = await labContext(c);
  const groups = gradingGroups(c, ctx);
  if (!groups.length) return forbidden(c);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const [{ students, released }, notebooks] = await Promise.all([
    c.var.tenant.grading.releasedInCourse(
      ctx.course.id,
      groups.map((g) => g.id),
    ),
    c.var.tenant.notebooks.ofLabs(ctx.labs.map((l) => l.id)),
  ]);
  const graded = new Set(released.map((g) => g.notebookId));
  const labN = new Map(ctx.labs.map((l) => [l.id, l.n]));
  const seen = new Set<string>();
  return c.json({
    notebooks: notebooks
      .filter((nb) => graded.has(nb.id))
      .map((nb) => ({ id: nb.id, lab: labN.get(nb.labId) ?? 0, title: nb.title }))
      .sort((a, b) => a.lab - b.lab),
    // A student in two of these groups is listed once, with the first.
    students: students.flatMap((s) => {
      if (seen.has(s.id)) return [];
      seen.add(s.id);
      return [{ id: s.id, username: s.username, fullName: s.fullName, group: groupName.get(s.groupId ?? '') ?? '' }];
    }),
    grades: released.map((g) => ({ ...g, score: Number(g.score) })),
  } satisfies CourseGrades);
});

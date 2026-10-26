import { zValidator } from '@hono/zod-validator';
import { type Context, Hono } from 'hono';
import type { MyGrade } from '../../shared/grading';
import {
  type Assignment,
  assignmentInput,
  MAX_SUBMISSION_CODE,
  type MySubmission,
  type SubmissionDetail,
  type SubmissionList,
  type SubmissionSummary,
} from '../../shared/submissions';
import type { TenantEnv } from '../auth/access';
import { NotFoundError } from '../db/tenant';
import { forbidden, invalidRequest } from './course-context';
import { kolokiumViews, type LabContext, labContext, notebookInUrl, visibleLab } from './lab-context';

// Handing in work (#52), under …/labs/:labId/notebooks/:notebookId.
//
// Staff who may publish a lab open its notebook for submission to a group, with a deadline. Until
// then, a student of that group hands in their work: the server copies their saved code and the
// exercises they solved, replacing what they handed in before. A submission is read by its author,
// and by staff who review the student's group (submission.review); never by other students.

const summaryOf = (row: { solved: number[]; attempts: number; submittedAt: Date }): SubmissionSummary => ({
  submittedAt: row.submittedAt.toISOString(),
  attempts: row.attempts,
  solved: row.solved,
});

/** A group's kolokium settings, or null for a plain deadline (#169). */
const setupOf = (a: { opensAt: Date | null; minutes: number | null }) =>
  a.opensAt && a.minutes ? { opensAt: a.opensAt.toISOString(), minutes: a.minutes } : null;

/** The course's groups in which this user may do `capability`. */
const groupsWhere = (c: Context<TenantEnv>, ctx: LabContext, capability: 'lab.publish' | 'submission.review') =>
  ctx.groups.filter((g) => c.var.access.can(capability, { courseId: ctx.course.id, groupId: g.id }));

/** The latest deadline among the user's own groups, and whether one of them is still open. */
/** The user's latest deadline for the notebook among their groups, and whether it is still open. */
export async function deadlineFor(c: Context<TenantEnv>, ctx: LabContext, notebookId: string) {
  // A kolokium (#169): open only from the student's start until their end, and handed in once.
  const kolokium = kolokiumViews(ctx).find((k) => k.notebookId === notebookId);
  if (kolokium) {
    const { labId: _, ...view } = kolokium;
    const running = !!view.endsAt && ctx.now.getTime() < Date.parse(view.endsAt) && !view.submittedAt;
    return { dueAt: new Date(view.dueAt), open: running, kolokium: view };
  }
  const mine = new Set(
    ctx.groups
      .filter((g) => c.var.access.can('submission.create', { courseId: ctx.course.id, groupId: g.id }))
      .map((g) => g.id),
  );
  const due = (await c.var.tenant.submissions.assignmentsOf(notebookId))
    .filter((a) => mine.has(a.groupId))
    .map((a) => a.dueAt.getTime());
  if (!due.length) return null;
  const latest = Math.max(...due);
  return { dueAt: new Date(latest), open: latest > Date.now(), kolokium: null };
}

/** A grade as its student sees it: only once released. */
const released = (
  row:
    | { autoScore: number; maxScore: number; score: number | null; feedback: string | null; releasedAt: Date | null }
    | undefined,
): MyGrade | null =>
  row?.releasedAt ? { score: row.score ?? row.autoScore, maxScore: row.maxScore, feedback: row.feedback } : null;

export const submissionRoutes = new Hono<TenantEnv>()
  // The groups' deadlines, for staff who may open it or review it.
  .get('/assignments', async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const seen = new Set(
      [...groupsWhere(c, ctx, 'lab.publish'), ...groupsWhere(c, ctx, 'submission.review')].map((g) => g.id),
    );
    if (!seen.size) return forbidden(c);
    const list = await c.var.tenant.submissions.assignmentsOf(nb.id);
    return c.json(
      list
        .filter((a) => seen.has(a.groupId))
        .map((a): Assignment => ({ groupId: a.groupId, dueAt: a.dueAt.toISOString(), kolokium: setupOf(a) })),
    );
  })

  // Opens it to a group until the deadline, or moves the deadline.
  .put('/assignments/:groupId', zValidator('json', assignmentInput, invalidRequest), async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const groupId = c.req.param('groupId');
    if (!ctx.groups.some((g) => g.id === groupId)) throw new NotFoundError();
    if (!c.var.access.can('lab.publish', { courseId: ctx.course.id, groupId })) return forbidden(c);
    const { dueAt, kolokium } = c.req.valid('json');
    const window = kolokium ? { opensAt: new Date(kolokium.opensAt), minutes: kolokium.minutes } : null;
    await c.var.tenant.submissions.open(nb.id, groupId, new Date(dueAt), window);
    return c.json({
      groupId,
      dueAt: new Date(dueAt).toISOString(),
      kolokium: window ? { opensAt: window.opensAt.toISOString(), minutes: window.minutes } : null,
    } satisfies Assignment);
  })

  // Closes it; what was handed in stays.
  .delete('/assignments/:groupId', async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const groupId = c.req.param('groupId');
    if (!ctx.groups.some((g) => g.id === groupId)) throw new NotFoundError();
    if (!c.var.access.can('lab.publish', { courseId: ctx.course.id, groupId })) return forbidden(c);
    await c.var.tenant.submissions.close(nb.id, groupId);
    return c.body(null, 204);
  })

  // The user's own: their deadline and what they handed in.
  .get('/submission', async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const userId = c.var.user?.id as string;
    const [deadline, row, grade] = await Promise.all([
      deadlineFor(c, ctx, nb.id),
      c.var.tenant.submissions.of(nb.id, userId),
      c.var.tenant.grading.of(nb.id, userId),
    ]);
    return c.json({
      dueAt: deadline?.dueAt.toISOString() ?? null,
      grade: released(grade),
      open: deadline?.open ?? false,
      submission: row ? summaryOf(row) : null,
      kolokium: deadline?.kolokium ?? null,
    } satisfies MySubmission);
  })

  // Starts the student's kolokium clock (#169), between its opening and its due time. It cannot use
  // notebookInUrl: the notebook stays closed to the student until they start.
  .post('/kolokium/start', async (c) => {
    const ctx = await labContext(c);
    const lab = visibleLab(c, ctx);
    const notebookId = c.req.param('notebookId');
    const kolokium = kolokiumViews(ctx, lab.id).find((k) => k.notebookId === notebookId);
    if (!kolokium) throw new NotFoundError();
    const now = ctx.now.getTime();
    if (now < Date.parse(kolokium.opensAt) || now >= Date.parse(kolokium.dueAt)) {
      return c.json({ error: 'closed' }, 409);
    }
    await c.var.tenant.submissions.start(kolokium.notebookId, c.var.user?.id as string, ctx.now);
    const started = kolokiumViews(await labContext(c), lab.id).find((k) => k.notebookId === notebookId);
    const { labId: _, ...view } = started ?? kolokium;
    return c.json(view);
  })

  // Hands in the user's saved code and solved exercises, before the deadline.
  .post('/submission', async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const userId = c.var.user?.id as string;
    const deadline = await deadlineFor(c, ctx, nb.id);
    if (!deadline) return forbidden(c);
    if (!deadline.open) return c.json({ error: 'closed' }, 409);
    const [edits, solved, traces] = await Promise.all([
      c.var.tenant.codeEdits.ofUser(nb.id, userId),
      c.var.tenant.exercises.doneBy(nb.id, userId),
      c.var.tenant.traceAnswers.ofUser(nb.id, userId),
    ]);
    const code = edits.map((e) => ({ cell: e.cell, code: e.code }));
    if (code.reduce((n, e) => n + e.code.length, 0) > MAX_SUBMISSION_CODE) return c.json({ error: 'too_large' }, 413);
    // The graded trace tables' rows go in as they are (#168); the server scores them when grading.
    await c.var.tenant.submissions.submit({ notebookId: nb.id, userId, code, solved, traces });
    const row = await c.var.tenant.submissions.of(nb.id, userId);
    // A kolokium is handed in once (#169): after this, it is closed to the student.
    const kolokium = deadline.kolokium
      ? { ...deadline.kolokium, submittedAt: row?.submittedAt.toISOString() ?? null }
      : null;
    return c.json({
      dueAt: deadline.dueAt.toISOString(),
      grade: released(await c.var.tenant.grading.of(nb.id, userId)),
      open: !kolokium,
      submission: row ? summaryOf(row) : null,
      kolokium,
    } satisfies MySubmission);
  })

  // A group's students and what each handed in, for staff who review the group.
  .get('/submissions', async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const allowed = groupsWhere(c, ctx, 'submission.review').sort((a, b) => a.name.localeCompare(b.name));
    if (!allowed.length) return forbidden(c);
    const group = c.req.query('group') || allowed[0]?.id || null;
    if (!allowed.some((g) => g.id === group)) return forbidden(c);
    const [deadlines, rows, starts] = await Promise.all([
      c.var.tenant.submissions.assignmentsOf(nb.id),
      c.var.tenant.submissions.ofGroup(nb.id, group as string),
      c.var.tenant.submissions.startsOf(nb.id),
    ]);
    return c.json({
      groups: allowed.map((g) => {
        const deadline = deadlines.find((d) => d.groupId === g.id);
        return {
          id: g.id,
          name: g.name,
          dueAt: deadline?.dueAt.toISOString() ?? null,
          kolokium: deadline ? setupOf(deadline) : null,
        };
      }),
      group,
      students: rows.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        username: row.username,
        submission:
          row.submittedAt && row.solved && row.attempts !== null
            ? summaryOf({ solved: row.solved, attempts: row.attempts, submittedAt: row.submittedAt })
            : null,
        startedAt: starts.find((s) => s.userId === row.id)?.startedAt.toISOString() ?? null,
      })),
    } satisfies SubmissionList);
  })

  // One student's submission, with their code, for staff who review a group of theirs.
  .get('/submissions/:userId', async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const allowed = groupsWhere(c, ctx, 'submission.review').map((g) => g.id);
    if (!allowed.length) return forbidden(c);
    const userId = c.req.param('userId');
    if (!(await c.var.tenant.submissions.isStudentOf(userId, allowed))) throw new NotFoundError();
    const [row, user] = await Promise.all([c.var.tenant.submissions.of(nb.id, userId), c.var.tenant.users.get(userId)]);
    if (!row || !user) throw new NotFoundError();
    return c.json({
      ...summaryOf(row),
      fullName: user.fullName,
      username: user.username,
      code: row.code,
    } satisfies SubmissionDetail);
  });

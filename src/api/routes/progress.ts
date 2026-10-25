import { Hono } from 'hono';
import { PREDICTION_TOPICS, type PredictionTopic } from '../../shared/predictions';
import type { MyProgress } from '../../shared/progress';
import { type ReviewPlan, type ReviewTopic, topicsOfEmbed } from '../../shared/review';
import type { TenantEnv } from '../auth/access';
import { labContext, mayReadNotebook, openToViewer } from './lab-context';

// "My progress" (#99), under /api/orgs/:org/courses/:courseId/progress: the signed-in user's own
// labs, exercises, submissions and released grades. Nobody else's, so it needs no capability
// beyond seeing the course; students see only the labs open to them.

export const progressRoutes = new Hono<TenantEnv>().get('/', async (c) => {
  const ctx = await labContext(c);
  const userId = c.var.user?.id as string;
  const courseId = ctx.course.id;
  const ownGroups = ctx.groups
    .filter((g) => c.var.access.can('submission.create', { courseId, groupId: g.id }))
    .map((g) => g.id);
  const labs = ctx.labs.filter((lab) => ctx.staff || openToViewer(ctx, lab)).sort((a, b) => a.n - b.n);
  const [notebooks, rows, topics] = await Promise.all([
    c.var.tenant.notebooks.ofLabs(labs.map((l) => l.id)),
    c.var.tenant.progress.of(courseId, userId, ownGroups),
    c.var.tenant.predictions.ofStudent(courseId, userId),
  ]);
  const count = (list: { notebookId: string; n: number }[]) => new Map(list.map((r) => [r.notebookId, Number(r.n)]));
  const set = count(rows.set);
  const solved = count(rows.solved);
  const opened = new Set(rows.opened.map((r) => r.labId));
  const due = new Map(rows.due.map((r) => [r.notebookId, Number(r.dueAt)]));
  const handed = new Map(rows.handed.map((r) => [r.notebookId, r.submittedAt]));
  const graded = new Map(rows.graded.map((r) => [r.notebookId, r]));

  return c.json({
    labs: labs.map((lab) => ({
      id: lab.id,
      n: lab.n,
      title: lab.title,
      opened: opened.has(lab.id),
      notebooks: notebooks
        .filter((nb) => nb.labId === lab.id && nb.kind !== 'solution' && mayReadNotebook(ctx, lab, nb))
        .sort((a, b) => a.position - b.position)
        .map((nb) => {
          const grade = graded.get(nb.id);
          const deadline = due.get(nb.id);
          return {
            id: nb.id,
            title: nb.title,
            exercises: set.get(nb.id) ?? 0,
            solved: solved.get(nb.id) ?? 0,
            dueAt: deadline ? new Date(deadline * 1000).toISOString() : null,
            submittedAt: handed.get(nb.id)?.toISOString() ?? null,
            grade: grade
              ? { score: grade.score ?? grade.autoScore, maxScore: grade.maxScore, feedback: grade.feedback }
              : null,
          };
        }),
    })),
    // In the course's order of topics, the ones the student has met.
    topics: PREDICTION_TOPICS.flatMap((topic) => {
      const row = topics.find((t) => t.topic === topic);
      return row ? [{ topic: topic as PredictionTopic, asked: Number(row.asked), right: Number(row.right) }] : [];
    }),
  } satisfies MyProgress);
});

/**
 * The review session's plan (#152), under /api/orgs/:org/courses/:courseId/review: the algorithms of
 * the labs the student has opened (staff: every lab), each with the first lab that teaches it, and
 * the student's own first-try results. Only their own, like "My progress".
 */
export const reviewRoutes = new Hono<TenantEnv>().get('/', async (c) => {
  const ctx = await labContext(c);
  const userId = c.var.user?.id as string;
  const courseId = ctx.course.id;
  const [rows, results] = await Promise.all([
    c.var.tenant.progress.of(courseId, userId, []),
    c.var.tenant.predictions.ofStudent(courseId, userId),
  ]);
  const opened = new Set(rows.opened.map((r) => r.labId));
  const labs = ctx.labs
    .filter((lab) => ctx.staff || (openToViewer(ctx, lab) && opened.has(lab.id)))
    .sort((a, b) => a.n - b.n);
  const notebooks = (await c.var.tenant.notebooks.ofLabs(labs.map((l) => l.id))).filter((nb) => {
    const lab = labs.find((l) => l.id === nb.labId);
    return lab && nb.kind !== 'solution' && mayReadNotebook(ctx, lab, nb);
  });
  const embeds = await c.var.tenant.notebooks.embedsOfNotebooks(notebooks.map((nb) => nb.id));
  const topics = new Map<ReviewTopic, ReviewPlan['topics'][number]>();
  for (const lab of labs) {
    const ofLab = new Set(notebooks.filter((nb) => nb.labId === lab.id).map((nb) => nb.id));
    for (const embed of embeds.filter((e) => ofLab.has(e.notebookId)))
      for (const topic of topicsOfEmbed(embed.viz, embed.props))
        if (!topics.has(topic)) topics.set(topic, { topic, labId: lab.id, lab: lab.n, labTitle: lab.title });
  }
  return c.json({
    topics: [...topics.values()],
    results: results.flatMap((r) =>
      (PREDICTION_TOPICS as readonly string[]).includes(r.topic)
        ? [{ topic: r.topic as PredictionTopic, asked: Number(r.asked), right: Number(r.right) }]
        : [],
    ),
  } satisfies ReviewPlan);
});

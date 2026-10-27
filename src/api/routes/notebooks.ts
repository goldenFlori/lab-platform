import { zValidator } from '@hono/zod-validator';
import { type Context, Hono } from 'hono';
import { explainInput } from '../../shared/ai';
import { type CodeEdit, codeEditInput, type WorkSaved, workInput } from '../../shared/code-edits';
import { type ExerciseProgress, exercisesInput } from '../../shared/exercises';
import {
  createNotebookInput,
  type Embed,
  embedsInput,
  FILE_NAME,
  MAX_FILE_BYTES,
  type NotebookDetail,
  type NotebookSummary,
  ORIGINAL_FILE,
  RENDERED_FILE,
} from '../../shared/notebooks';
import { predictionInput } from '../../shared/predictions';
import { searchSectionsInput } from '../../shared/search';
import { type TraceAnswers, traceAnswersInput } from '../../shared/trace-answers';
import { tracePoints } from '../../shared/trace-grading';
import { streamAi } from '../ai/gateway';
import { explainMessages } from '../ai/purposes';
import type { TenantEnv } from '../auth/access';
import { NotFoundError, type StoredFile } from '../db/tenant';
import { recordActivity, today } from './activity';
import { forbidden, invalidRequest } from './course-context';
import { gradingRoutes } from './grading';
import {
  type LabContext,
  labContext,
  mayReadNotebook,
  notebookInUrl,
  runningKolokia,
  solutionsOpenTo,
  visibleLab,
} from './lab-context';
import { deadlineFor, submissionRoutes } from './submissions';

// A lab's notebooks (#14), under /api/orgs/:org/courses/:courseId/labs/:labId/notebooks.
//
// Upload, by staff with course.manage, in steps that stay within D1's limits: create the notebook,
// PUT each file (the original, the converted cells, each image or figure), then mark it ready.
// Reading follows the lab: students see ready notebooks of labs open to them, and solution
// notebooks only once their solutions are open. Files are served as stored, gzip included.

type Notebook = {
  id: string;
  kind: 'main' | 'extra' | 'solution';
  title: string;
  position: number;
  originalName: string;
  readyAt: Date | null;
};
/** Types a file may be served as; anything else is refused at upload. */
const SAFE_TYPES = new Set([
  'application/json',
  'application/x-ipynb+json',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
]);

const summary = (nb: Notebook): NotebookSummary => ({
  id: nb.id,
  kind: nb.kind,
  title: nb.title,
  position: nb.position,
  originalName: nb.originalName,
  ready: nb.readyAt !== null,
});

const canManage = (c: Context<TenantEnv>, ctx: LabContext) =>
  c.var.access.can('course.manage', { courseId: ctx.course.id });

async function detail(c: Context<TenantEnv>, nb: Notebook): Promise<NotebookDetail> {
  const [embeds, exercises] = await Promise.all([
    c.var.tenant.notebooks.embedsOf(nb.id),
    c.var.tenant.exercises.of(nb.id),
  ]);
  return {
    ...summary(nb),
    exercises,
    embeds: embeds
      .sort((a, b) => a.cell - b.cell)
      .map((e): Embed => ({ cell: e.cell, viz: e.viz, title: e.title, props: e.props })),
  };
}

/** A cell number from the URL: a notebook's own cell index. */
/** A graded trace table's points at this cell (#168), or null when there is none. */
async function gradedTrace(c: Context<TenantEnv>, notebookId: string, param: string | undefined) {
  const cell = cellParam(param);
  if (cell === null) return null;
  const embed = (await c.var.tenant.notebooks.embedsOf(notebookId)).find((e) => e.cell === cell);
  const points = embed?.viz === 'tabela-gjurmimit' ? tracePoints(embed.props) : 0;
  return points > 0 ? points : null;
}

function cellParam(value: string | undefined) {
  const cell = Number(value);
  return Number.isInteger(cell) && cell >= 0 && cell <= 10_000 ? cell : null;
}

/** A download name that cannot break the header. */
const attachment = (name: string) =>
  `attachment; filename="${name.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;

export const notebookRoutes = new Hono<TenantEnv>()
  .get('/', async (c) => {
    const ctx = await labContext(c);
    const lab = visibleLab(c, ctx);
    const notebooks = await c.var.tenant.notebooks.ofLab(lab.id);
    return c.json({ notebooks: notebooks.filter((nb) => mayReadNotebook(ctx, lab, nb)).map(summary) });
  })

  .post('/', zValidator('json', createNotebookInput, invalidRequest), async (c) => {
    const ctx = await labContext(c);
    const lab = visibleLab(c, ctx);
    if (!canManage(c, ctx)) return forbidden(c);
    const existing = await c.var.tenant.notebooks.ofLab(lab.id);
    const nb = await c.var.tenant.notebooks.create({
      ...c.req.valid('json'),
      labId: lab.id,
      position: Math.max(0, ...existing.map((n) => n.position)) + 1,
      readyAt: null,
    });
    return c.json(summary(nb), 201);
  })

  // The lab page asks for this whenever a notebook opens: a student opened the lab (#18).
  .get('/:notebookId', async (c) => {
    const { ctx, lab, nb } = await notebookInUrl(c);
    recordActivity(c, ctx, lab.id, 'view');
    return c.json(await detail(c, nb));
  })

  .put('/:notebookId/files/:name', async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    if (!canManage(c, ctx)) return forbidden(c);
    const name = c.req.param('name');
    const mime = (c.req.header('Content-Type') ?? '').split(';')[0]?.trim() ?? '';
    const encoding = c.req.header('X-Content-Encoding') === 'gzip' ? 'gzip' : 'identity';
    if (!FILE_NAME.test(name) || !SAFE_TYPES.has(mime)) return c.json({ error: 'invalid_request' }, 400);
    if (Number(c.req.header('Content-Length') ?? 0) > MAX_FILE_BYTES) return c.json({ error: 'invalid_request' }, 413);
    const data = new Uint8Array(await c.req.arrayBuffer());
    if (data.length > MAX_FILE_BYTES) return c.json({ error: 'invalid_request' }, 413);
    await c.var.tenant.notebooks.putFile(nb.id, name, { mime, encoding, data });
    return c.body(null, 204);
  })

  .post('/:notebookId/ready', async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    if (!canManage(c, ctx)) return forbidden(c);
    const names = await c.var.tenant.notebooks.fileNames(nb.id);
    if (!names.includes(ORIGINAL_FILE) || !names.includes(RENDERED_FILE)) {
      return c.json({ error: 'invalid_request' }, 409);
    }
    const ready = await c.var.tenant.notebooks.update(nb.id, { readyAt: nb.readyAt ?? new Date() });
    return c.json(await detail(c, ready ?? nb));
  })

  .get('/:notebookId/files/:name', async (c) => {
    const { ctx, lab, nb } = await notebookInUrl(c);
    const file = await c.var.tenant.notebooks.getFile(nb.id, c.req.param('name'));
    if (!file) throw new NotFoundError();
    // The original .ipynb, downloaded to work on it (#18).
    if (c.req.param('name') === ORIGINAL_FILE) recordActivity(c, ctx, lab.id, 'download');

    // Uploaded by staff, read by students: never let a file run code on this origin.
    const headers: Record<string, string> = {
      'Content-Type': file.mime,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      Vary: 'Accept-Encoding',
    };
    if (c.req.param('name') === ORIGINAL_FILE) headers['Content-Disposition'] = attachment(nb.originalName);

    return storedFileResponse(c, file, headers);
  })

  .put('/:notebookId/embeds', zValidator('json', embedsInput, invalidRequest), async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    if (!canManage(c, ctx)) return forbidden(c);
    await c.var.tenant.notebooks.setEmbeds(
      nb.id,
      c.req
        .valid('json')
        .embeds.map((e) => ({ cell: e.cell, viz: e.viz, title: e.title ?? null, props: e.props ?? null })),
    );
    return c.json(await detail(c, nb));
  })

  // Its search index (#17), made where it was converted; replaces the old one.
  .put('/:notebookId/search', zValidator('json', searchSectionsInput, invalidRequest), async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    if (!canManage(c, ctx)) return forbidden(c);
    await c.var.tenant.notebooks.setSearchSections(nb.id, c.req.valid('json').sections);
    return c.body(null, 204);
  })

  // A user's own versions of the code cells (#49): only ever their own, for anyone who may read the
  // notebook. Staff have no way to read a student's edits; submitted work is shared on its own.
  .get('/:notebookId/edits', async (c) => {
    const { nb } = await notebookInUrl(c);
    const rows = await c.var.tenant.codeEdits.ofUser(nb.id, c.var.user?.id as string);
    return c.json({
      edits: rows.map((row) => ({ cell: row.cell, code: row.code, updatedAt: row.updatedAt.toISOString() })),
    } satisfies { edits: CodeEdit[] });
  })

  .put('/:notebookId/edits/:cell', zValidator('json', codeEditInput, invalidRequest), async (c) => {
    const { nb } = await notebookInUrl(c);
    const cell = cellParam(c.req.param('cell'));
    if (cell === null) return c.json({ error: 'invalid_request' }, 400);
    const updatedAt = await c.var.tenant.codeEdits.save({
      notebookId: nb.id,
      userId: c.var.user?.id as string,
      cell,
      code: c.req.valid('json').code,
    });
    return c.json({ cell, updatedAt: updatedAt.toISOString() });
  })

  .delete('/:notebookId/edits/:cell', async (c) => {
    const { nb } = await notebookInUrl(c);
    const cell = cellParam(c.req.param('cell'));
    if (cell === null) return c.json({ error: 'invalid_request' }, 400);
    await c.var.tenant.codeEdits.reset(nb.id, c.var.user?.id as string, cell);
    return c.body(null, 204);
  })

  // Everything a student changed since their last save, in one request (#177): code cells for anyone
  // who may read the notebook, and graded trace rows only while it is open to the student for
  // submission. Tables it may not keep are named in `refused`; the code is saved all the same.
  .put('/:notebookId/work', zValidator('json', workInput, invalidRequest), async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const { code, traces } = c.req.valid('json');
    let kept = traces;
    if (traces.length) {
      const [embeds, deadline] = await Promise.all([
        c.var.tenant.notebooks.embedsOf(nb.id),
        ctx.staff ? null : deadlineFor(c, ctx, nb.id),
      ]);
      const graded = new Set(
        embeds.filter((e) => e.viz === 'tabela-gjurmimit' && tracePoints(e.props) > 0).map((e) => e.cell),
      );
      kept = deadline?.open ? traces.filter((t) => graded.has(t.cell)) : [];
    }
    const savedAt = await c.var.tenant.codeEdits.saveWork({
      notebookId: nb.id,
      userId: c.var.user?.id as string,
      code,
      traces: kept,
    });
    return c.json({
      savedAt: savedAt.toISOString(),
      refused: traces.filter((t) => !kept.includes(t)).map((t) => t.cell),
    } satisfies WorkSaved);
  })

  .delete('/:notebookId/edits', async (c) => {
    const { nb } = await notebookInUrl(c);
    await c.var.tenant.codeEdits.reset(nb.id, c.var.user?.id as string);
    return c.body(null, 204);
  })

  // Its exercises (#51): found where it was converted, changed by staff; replaces the old list.
  .put('/:notebookId/exercises', zValidator('json', exercisesInput, invalidRequest), async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    if (!canManage(c, ctx)) return forbidden(c);
    await c.var.tenant.exercises.set(nb.id, c.req.valid('json').exercises);
    return c.json(await detail(c, nb));
  })

  // Progress on them: the exercises this user completed, and for staff who may see the course's
  // activity, how many of their groups' students completed each, as counts only.
  .get('/:notebookId/exercises/progress', async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const { access, tenant } = c.var;
    const courseId = ctx.course.id;
    const wholeCourse = access.can('analytics.view', { courseId });
    const allowed = ctx.groups.filter((g) => access.can('analytics.view', { courseId, groupId: g.id }));
    const [done, counted] = await Promise.all([
      tenant.exercises.doneBy(nb.id, c.var.user?.id as string),
      wholeCourse || allowed.length > 0
        ? tenant.exercises.counts({
            notebookId: nb.id,
            courseId,
            groupIds: wholeCourse ? null : allowed.map((g) => g.id),
          })
        : null,
    ]);
    return c.json({
      done,
      counts: counted?.counts ?? null,
      students: counted?.students ?? null,
    } satisfies ExerciseProgress);
  })

  // A student's check passed in their browser: kept once, and counted in the course's activity.
  // Practice only, so the browser is trusted with it; staff are not counted.
  .post('/:notebookId/exercises/:cell/done', async (c) => {
    const { ctx, lab, nb } = await notebookInUrl(c);
    const cell = cellParam(c.req.param('cell'));
    if (cell === null) return c.json({ error: 'invalid_request' }, 400);
    const exercises = await c.var.tenant.exercises.of(nb.id);
    if (!exercises.some((e) => e.cell === cell)) throw new NotFoundError();
    if (!ctx.staff) {
      await c.var.tenant.exercises.complete({ notebookId: nb.id, cell, userId: c.var.user?.id as string });
      recordActivity(c, ctx, lab.id, 'exercise');
    }
    return c.body(null, 204);
  })

  // A student's first answer to a decision of an embedded visualization (#151): kept once, never
  // changed by a later try. Practice like the exercises, so the browser is trusted with it; staff
  // are not counted.
  .post('/:notebookId/embeds/:cell/results', zValidator('json', predictionInput, invalidRequest), async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const cell = cellParam(c.req.param('cell'));
    if (cell === null) return c.json({ error: 'invalid_request' }, 400);
    const embeds = await c.var.tenant.notebooks.embedsOf(nb.id);
    if (!embeds.some((e) => e.cell === cell)) throw new NotFoundError();
    if (!ctx.staff) {
      await c.var.tenant.predictions.record({
        ...c.req.valid('json'),
        notebookId: nb.id,
        cell,
        userId: c.var.user?.id as string,
        day: today(),
      });
    }
    return c.body(null, 204);
  })

  // A graded trace table (#168): the user's saved rows, and whether they may still change them. A
  // practice table (no points) has none: its rows are checked in the browser and never kept.
  .get('/:notebookId/embeds/:cell/trace', async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const points = await gradedTrace(c, nb.id, c.req.param('cell'));
    if (points === null) throw new NotFoundError();
    const userId = c.var.user?.id as string;
    const [saved, deadline] = await Promise.all([
      c.var.tenant.traceAnswers.ofUser(nb.id, userId),
      ctx.staff ? null : deadlineFor(c, ctx, nb.id),
    ]);
    const cell = Number(c.req.param('cell'));
    return c.json({
      rows: saved.find((s) => s.cell === cell)?.rows ?? [],
      open: deadline?.open ?? false,
      staff: ctx.staff,
      points,
    } satisfies TraceAnswers);
  })

  // Saves them as the student types, only while the notebook is open to them for submission.
  .put('/:notebookId/embeds/:cell/trace', zValidator('json', traceAnswersInput, invalidRequest), async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    const points = await gradedTrace(c, nb.id, c.req.param('cell'));
    if (points === null) throw new NotFoundError();
    if (ctx.staff) return forbidden(c);
    const deadline = await deadlineFor(c, ctx, nb.id);
    if (!deadline) return forbidden(c);
    if (!deadline.open) return c.json({ error: 'closed' }, 409);
    await c.var.tenant.traceAnswers.save({
      notebookId: nb.id,
      userId: c.var.user?.id as string,
      cell: Number(c.req.param('cell')),
      rows: c.req.valid('json').rows,
    });
    return c.body(null, 204);
  })

  // "Explain my error" (#86): hints by default; the full fix only on an exercise set to it, once
  // the lab's solutions are open to the user; nothing on an exercise set to off. A student's
  // question is kept with its answer for the staff who review their group.
  .post('/:notebookId/explain', zValidator('json', explainInput, invalidRequest), async (c) => {
    const { ctx, lab, nb } = await notebookInUrl(c);
    const question = c.req.valid('json');
    const exercise = (await c.var.tenant.exercises.of(nb.id)).find((e) => e.cell === question.cell);
    const mode = exercise?.ai ?? 'hints';
    if (mode === 'off') return c.json({ error: 'ai_off' }, 403);
    // No AI help while a kolokium runs for the student's group (#169).
    if (!ctx.staff && runningKolokia(ctx).length) return c.json({ error: 'ai_off' }, 403);
    const { cell, code, error } = question;
    const keep = (answer: string) =>
      c.var.tenant.ai.ask({
        courseId: ctx.course.id,
        notebookId: nb.id,
        userId: c.var.user?.id as string,
        cell,
        code,
        error,
        answer,
      });
    return streamAi(c, {
      course: ctx.course,
      staff: c.var.access.can('lab.publish', { courseId: ctx.course.id }),
      purpose: 'explain',
      messages: explainMessages(question, mode === 'full' && solutionsOpenTo(ctx, lab) ? 'full' : 'hints', ctx.course),
      onAnswer: ctx.staff ? undefined : keep,
    });
  })

  .route('/:notebookId', submissionRoutes)
  .route('/:notebookId', gradingRoutes)

  .delete('/:notebookId', async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    if (!canManage(c, ctx)) return forbidden(c);
    await c.var.tenant.notebooks.remove(nb.id);
    return c.body(null, 204);
  });

/** A stored file as it is: gzipped ones go out gzipped to browsers that accept it, never re-encoded. */
export function storedFileResponse(c: Context, file: StoredFile, headers: Record<string, string>) {
  if (file.encoding !== 'gzip') return new Response(file.data, { headers });
  if (/\bgzip\b/.test(c.req.header('Accept-Encoding') ?? '')) {
    return new Response(file.data, { headers: { ...headers, 'Content-Encoding': 'gzip' }, encodeBody: 'manual' });
  }
  return new Response(new Blob([file.data]).stream().pipeThrough(new DecompressionStream('gzip')), { headers });
}

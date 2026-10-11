import { zValidator } from '@hono/zod-validator';
import { type Context, Hono } from 'hono';
import { type CodeEdit, codeEditInput } from '../../shared/code-edits';
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
import { searchSectionsInput } from '../../shared/search';
import type { TenantEnv } from '../auth/access';
import { NotFoundError } from '../db/tenant';
import { recordActivity } from './activity';
import { forbidden, invalidRequest } from './course-context';
import { type LabContext, labContext, mayReadNotebook, visibleLab } from './lab-context';

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

/** The lab and notebook in the URL as this user may see them, or 404. */
async function notebookInUrl(c: Context<TenantEnv>) {
  const ctx = await labContext(c);
  const lab = visibleLab(c, ctx);
  const nb = await c.var.tenant.notebooks.get(c.req.param('notebookId') ?? '');
  if (!nb || nb.labId !== lab.id || !mayReadNotebook(ctx, lab, nb)) throw new NotFoundError();
  return { ctx, lab, nb };
}

const canManage = (c: Context<TenantEnv>, ctx: LabContext) =>
  c.var.access.can('course.manage', { courseId: ctx.course.id });

async function detail(c: Context<TenantEnv>, nb: Notebook): Promise<NotebookDetail> {
  const embeds = await c.var.tenant.notebooks.embedsOf(nb.id);
  return {
    ...summary(nb),
    embeds: embeds
      .sort((a, b) => a.cell - b.cell)
      .map((e): Embed => ({ cell: e.cell, viz: e.viz, title: e.title, props: e.props })),
  };
}

/** A cell number from the URL: a notebook's own cell index. */
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

    if (file.encoding !== 'gzip') return new Response(file.data, { headers });
    // Stored gzipped: sent as it is to browsers that accept gzip, so the Worker never re-encodes.
    if (/\bgzip\b/.test(c.req.header('Accept-Encoding') ?? '')) {
      return new Response(file.data, { headers: { ...headers, 'Content-Encoding': 'gzip' }, encodeBody: 'manual' });
    }
    return new Response(new Blob([file.data]).stream().pipeThrough(new DecompressionStream('gzip')), { headers });
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

  .delete('/:notebookId/edits', async (c) => {
    const { nb } = await notebookInUrl(c);
    await c.var.tenant.codeEdits.reset(nb.id, c.var.user?.id as string);
    return c.body(null, 204);
  })

  .delete('/:notebookId', async (c) => {
    const { ctx, nb } = await notebookInUrl(c);
    if (!canManage(c, ctx)) return forbidden(c);
    await c.var.tenant.notebooks.remove(nb.id);
    return c.body(null, 204);
  });

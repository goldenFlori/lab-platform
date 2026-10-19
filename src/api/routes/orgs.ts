import { Hono } from 'hono';
import type { AccessSummary } from '../../shared/capabilities';
import type { DeletionRequestView, EraseResult, ErasureView, PersonGrade } from '../../shared/my-data';
import { ORIGINAL_FILE } from '../../shared/notebook-files';
import { type ExportPage, isExportPart } from '../../shared/org-export';
import { type TenantEnv, tenantAccess } from '../auth/access';
import { NotFoundError } from '../db/tenant';
import { forbidden } from './course-context';
import { courseRoutes } from './courses';
import { storedFileResponse } from './notebooks';

// Everything about one organization lives under /api/orgs/:org, where :org is its slug.
export const orgRoutes = new Hono<TenantEnv>()
  .use('/:org/*', tenantAccess)
  .get('/:org/access', (c) =>
    c.json({ organization: c.get('organization'), capabilities: c.get('access').summary() } satisfies AccessSummary),
  )
  .route('/:org/courses', courseRoutes)
  // Users' requests to delete their data (#100), for the institution's admins.
  .get('/:org/deletion-requests', async (c) => {
    if (!c.var.access.can('org.manage')) return forbidden(c);
    return c.json((await c.var.tenant.personal.deletionRequests()) satisfies DeletionRequestView[]);
  })
  .post('/:org/deletion-requests/:id/handled', async (c) => {
    if (!c.var.access.can('org.manage')) return forbidden(c);
    if (!(await c.var.tenant.personal.handleDeletion(c.req.param('id'), c.var.user?.id as string)))
      throw new NotFoundError();
    return c.body(null, 204);
  })
  // Erasing the person behind an open request (#115): first their released grades, for the records.
  .get('/:org/deletion-requests/:id/grades', async (c) => {
    if (!c.var.access.can('org.manage')) return forbidden(c);
    const request = await c.var.tenant.personal.openRequest(c.req.param('id'));
    if (!request) throw new NotFoundError();
    return c.json({ grades: await c.var.tenant.personal.releasedGrades(request.userId) } satisfies {
      grades: PersonGrade[];
    });
  })
  .post('/:org/deletion-requests/:id/erase', async (c) => {
    if (!c.var.access.can('org.manage')) return forbidden(c);
    const { personal } = c.var.tenant;
    const request = await personal.openRequest(c.req.param('id'));
    if (!request) throw new NotFoundError();
    const me = c.var.user?.id as string;
    if (request.userId === me) return c.json({ error: 'own_account' }, 409);
    return c.json((await personal.erase(request.userId, request.createdAt, me)) satisfies EraseResult);
  })
  .get('/:org/erasures', async (c) => {
    if (!c.var.access.can('org.manage')) return forbidden(c);
    return c.json((await c.var.tenant.personal.erasures()) satisfies ErasureView[]);
  })
  // The institution's data for its admin (#117): one page of one part, and each notebook's original.
  .get('/:org/export/notebooks/:notebookId', async (c) => {
    if (!c.var.access.can('org.manage')) return forbidden(c);
    const file = await c.var.tenant.notebooks.getFile(c.req.param('notebookId'), ORIGINAL_FILE);
    if (!file) throw new NotFoundError();
    return storedFileResponse(c, file, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Accept-Encoding',
    });
  })
  .get('/:org/export/:part', async (c) => {
    if (!c.var.access.can('org.manage')) return forbidden(c);
    const part = c.req.param('part');
    if (!isExportPart(part)) throw new NotFoundError();
    const limit = Math.min(500, Math.max(1, Number(c.req.query('limit')) || 500));
    return c.json((await c.var.tenant.export.page(part, c.req.query('after') || null, limit)) satisfies ExportPage);
  });

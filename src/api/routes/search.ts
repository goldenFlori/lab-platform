import { Hono } from 'hono';
import type { SearchIndex } from '../../shared/search';
import type { TenantEnv } from '../auth/access';
import { labContext, mayReadNotebook, openToViewer } from './lab-context';

// Search (#17), under /api/orgs/:org/courses/:courseId/search: the course's search index as this
// user may see it. Staff get every lab; students only the labs open to their groups right now, and
// solutions only once they are open, by the same rules as the lab pages. A hidden lab's text never
// leaves the server, so the browser can search what it receives without any further check.

export const searchRoutes = new Hono<TenantEnv>().get('/', async (c) => {
  const ctx = await labContext(c);
  const labs = ctx.labs.filter((lab) => ctx.staff || openToViewer(ctx, lab));
  const labById = new Map(labs.map((lab) => [lab.id, lab]));
  const notebooks = (await c.var.tenant.notebooks.ofLabs([...labById.keys()])).filter((nb) => {
    const lab = labById.get(nb.labId);
    return lab !== undefined && nb.readyAt !== null && mayReadNotebook(ctx, lab, nb);
  });
  const sections = await c.var.tenant.notebooks.searchSectionsOf(notebooks.map((nb) => nb.id));
  return c.json({
    labs: labs.map((lab) => ({ id: lab.id, n: lab.n, title: lab.title, summary: lab.summary })),
    notebooks: notebooks.map((nb) => ({ id: nb.id, labId: nb.labId, kind: nb.kind, title: nb.title })),
    sections,
  } satisfies SearchIndex);
});

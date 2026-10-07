import { Hono } from 'hono';
import type { AccessSummary } from '../../shared/capabilities';
import { type TenantEnv, tenantAccess } from '../auth/access';
import { courseRoutes } from './courses';

// Everything about one organization lives under /api/orgs/:org, where :org is its slug.
export const orgRoutes = new Hono<TenantEnv>()
  .use('/:org/*', tenantAccess)
  .get('/:org/access', (c) =>
    c.json({ organization: c.get('organization'), capabilities: c.get('access').summary() } satisfies AccessSummary),
  )
  .route('/:org/courses', courseRoutes);

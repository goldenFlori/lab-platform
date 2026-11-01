import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { type Institution, newInstitutionInput } from '../../shared/platform';
import { isOwner } from '../auth/owner';
import { createDb } from '../db';
import { resetDemo } from '../db/demo';
import { createInstitutionWithAdmin, institutionsWithCounts, TakenError } from '../db/platform';
import type { AppEnv } from '../env';
import { notFound } from '../errors';

// The platform owner's console (#200), under /api/platform: every institution with its counts, and a
// new institution with its first admin. To anyone but an owner it answers as a route that does not
// exist, so a tenant cannot tell there is one.

const invalidRequest = (result: { success: boolean }, c: { json: (b: unknown, s: 400) => Response }) => {
  if (!result.success) return c.json({ error: 'invalid_request' }, 400);
};

export const platformRoutes = new Hono<AppEnv>()
  .use(async (c, next) => (isOwner(c.env, c.var.user) ? next() : notFound(c)))

  .get('/institutions', async (c) => {
    const rows = await institutionsWithCounts(createDb(c.env.DB));
    return c.json({
      institutions: rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt * 1000).toISOString() })),
    } satisfies { institutions: Institution[] });
  })

  .post('/institutions', zValidator('json', newInstitutionInput, invalidRequest), async (c) => {
    try {
      const created = await createInstitutionWithAdmin(createDb(c.env.DB), c.req.valid('json'));
      return c.json(created, 201);
    } catch (error) {
      if (error instanceof TakenError) return c.json({ error: `${error.what}_taken` }, 409);
      throw error;
    }
  })

  // The demo institution rebuilt now (#216), as every night: after importing its template course.
  .post('/demo/reset', async (c) => {
    const reset = await resetDemo(createDb(c.env.DB));
    return reset ? c.json(reset) : c.json({ error: 'not_found' }, 404);
  });

import { Hono } from 'hono';
import { type SharePreview, shareToken } from '../../shared/sharing';
import { requireUser } from '../auth/session';
import { createDb } from '../db';
import { findShare, shareDestinations, sharedLabs } from '../db/sharing';
import type { AppEnv } from '../env';

// GET /api/shares/:token: what a shared course offers (#203), for the link's page. Only staff who may
// create courses somewhere see it; to anyone else, as to a wrong token, the link does not exist, so
// a link that reached a student shows them nothing.
export const shareRoutes = new Hono<AppEnv>().get('/:token', requireUser, async (c) => {
  const token = c.req.param('token');
  const db = createDb(c.env.DB);
  const share = shareToken.safeParse(token).success ? await findShare(db, token) : undefined;
  const destinations = share ? await shareDestinations(db, c.get('user')?.id as string) : [];
  if (!share || destinations.length === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({
    title: share.title,
    academicYear: share.academicYear,
    institution: share.institution,
    solutions: share.solutions,
    labs: await sharedLabs(db, share),
    destinations,
  } satisfies SharePreview);
});

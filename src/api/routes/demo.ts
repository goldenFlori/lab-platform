import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { DEMO_ACCOUNTS, DEMO_ROLES, type DemoRole, type DemoStatus, isDemoAccount } from '../../shared/demo';
import { startSession } from '../auth/session';
import { createDb } from '../db';
import { demoAccountId, demoCourse } from '../db/demo';
import type { AppEnv } from '../env';

// Trying the platform (#216), under /api/demo: whether the demo institution is there, and signing a
// visitor in to its shared student or pedagog account, which have no password.
export const demoRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json({ enabled: (await demoCourse(createDb(c.env.DB))) !== null } satisfies DemoStatus))

  .post('/:role', async (c) => {
    const role = c.req.param('role') as DemoRole;
    if (!DEMO_ROLES.includes(role)) return c.json({ error: 'not_found' }, 404);
    const db = createDb(c.env.DB);
    const [course, userId] = await Promise.all([demoCourse(db), demoAccountId(db, DEMO_ACCOUNTS[role].username)]);
    if (!course || !userId) return c.json({ error: 'not_found' }, 404);
    await startSession(c, userId);
    return c.json({ courseId: course.courseId });
  });

/**
 * What a demo account may change: what trying the platform needs (running and saving code, exercises,
 * hints, visualizations, handing in, opening labs, a Live Lab, grading) and nothing that would bring a
 * real person's data in or spoil the demo for the next visitor: no accounts, uploads, deletions or
 * shares. Reading is always allowed.
 */
const DEMO_WRITES = [
  /^\/api\/auth\/logout$/,
  /^\/api\/me$/,
  /^\/api\/client-errors$/,
  /\/labs\/[^/]+\/access(\/[^/]+)?$/,
  /\/labs\/[^/]+\/live(\/[^/]+\/end)?$/,
  /\/notebooks\/[^/]+\/(work|edits(\/\d+)?)$/,
  /\/notebooks\/[^/]+\/exercises\/\d+\/(done|hints\/\d+)$/,
  /\/notebooks\/[^/]+\/embeds\/\d+\/(results|trace)$/,
  /\/notebooks\/[^/]+\/(assignments\/[^/]+|kolokium\/start|submission)$/,
  /\/notebooks\/[^/]+\/(grading|grades\/release|grades\/[^/]+)$/,
];

export const demoGuard: MiddlewareHandler<AppEnv> = async (c: Context<AppEnv>, next) => {
  const user = c.get('user');
  if (!user || !isDemoAccount(user.username) || ['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next();
  if (DEMO_WRITES.some((allowed) => allowed.test(c.req.path))) return next();
  return c.json({ error: 'demo_read_only' }, 403);
};

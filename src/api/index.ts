import { Hono } from 'hono';
import { cleanUpExpired, session } from './auth/session';
import { createDb, isDatabaseReachable } from './db';
import type { AppEnv } from './env';
import { handleError, notFound } from './errors';
import { sameOrigin } from './middleware/same-origin';
import { authRoutes, meRoutes } from './routes/auth';
import { joinRoutes } from './routes/join';
import { orgRoutes } from './routes/orgs';

export const app = new Hono<AppEnv>().basePath('/api');

app.notFound(notFound);
app.onError(handleError);
app.use(sameOrigin);
app.use(session);

app.get('/health', async (c) => {
  const database = (await isDatabaseReachable(createDb(c.env.DB))) ? 'ok' : 'unavailable';
  return c.json({ status: database === 'ok' ? 'ok' : 'degraded', database }, database === 'ok' ? 200 : 503);
});

app.route('/auth', authRoutes);
app.route('/me', meRoutes);
app.route('/orgs', orgRoutes);
app.route('/join', joinRoutes);

export default {
  fetch: app.fetch,
  // Daily (see triggers in wrangler.jsonc).
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(cleanUpExpired(env));
  },
} satisfies ExportedHandler<Env>;

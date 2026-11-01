import { Hono } from 'hono';
import { cleanUpExpired, session } from './auth/session';
import { createDb, isDatabaseReachable } from './db';
import { meterD1 } from './db/meter';
import { applyRetention } from './db/platform';
import type { AppEnv } from './env';
import { handleError, notFound } from './errors';
import { sameOrigin } from './middleware/same-origin';
import { authRoutes, meRoutes } from './routes/auth';
import { joinBrandingRoutes } from './routes/branding';
import { clientErrorRoutes } from './routes/client-errors';
import { joinRoutes } from './routes/join';
import { orgRoutes } from './routes/orgs';
import { platformRoutes } from './routes/platform';
import { shareRoutes } from './routes/sharing';

export { LiveSession } from './live/session';

export const app = new Hono<AppEnv>().basePath('/api');

app.notFound(notFound);
app.onError(handleError);

// #176: with MEASURE=1, which production never sets, every request and the database's work in it are
// counted for scripts/measure-class.ts, which reads and resets the totals at /api/__meter. With
// MEASURE=queries each query's rows are also logged, to find the costly ones.
const measured = { requests: 0, queries: 0, read: 0, written: 0 };
app.use(async (c, next) => {
  const mode = (c.env as { MEASURE?: string }).MEASURE;
  if (mode !== '1' && mode !== 'queries') return next();
  if (c.req.path === '/api/__meter') {
    if (c.req.method === 'DELETE') Object.assign(measured, { requests: 0, queries: 0, read: 0, written: 0 });
    return c.json(measured);
  }
  measured.requests++;
  const log =
    mode === 'queries'
      ? (sql: string, meta: D1Meta | undefined) =>
          console.log(
            `[d1] ${c.req.method} ${c.req.path} read=${meta?.rows_read} written=${meta?.rows_written} ${sql.slice(0, 160)}`,
          )
      : undefined;
  c.env = { ...c.env, DB: meterD1(c.env.DB, measured, log) };
  return next();
});
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
app.route('/join', joinBrandingRoutes);
app.route('/client-errors', clientErrorRoutes);
app.route('/platform', platformRoutes);
app.route('/shares', shareRoutes);

export default {
  fetch: app.fetch,
  // Daily (see triggers in wrangler.jsonc).
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(cleanUpExpired(env));
    ctx.waitUntil(applyRetention(createDb(env.DB)));
  },
} satisfies ExportedHandler<Env>;

import { Hono } from 'hono';
import { createDb, isDatabaseReachable } from './db';
import { handleError, notFound } from './errors';

const app = new Hono<{ Bindings: Env }>().basePath('/api');

app.notFound(notFound);
app.onError(handleError);

app.get('/health', async (c) => {
  const database = (await isDatabaseReachable(createDb(c.env.DB))) ? 'ok' : 'unavailable';
  return c.json({ status: database === 'ok' ? 'ok' : 'degraded', database }, database === 'ok' ? 200 : 503);
});

export default app;

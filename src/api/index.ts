import { Hono } from 'hono';

const app = new Hono<{ Bindings: Env }>().basePath('/api');

app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;

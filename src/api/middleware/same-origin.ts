import type { MiddlewareHandler } from 'hono';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Refuses changes that do not come from our own pages. Together with SameSite=Lax cookies this
 * stops cross-site request forgery: another site cannot make a signed-in browser act for it.
 */
export const sameOrigin: MiddlewareHandler = async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method) && c.req.header('Origin') !== new URL(c.req.url).origin) {
    return c.json({ error: 'forbidden' }, 403);
  }
  await next();
};

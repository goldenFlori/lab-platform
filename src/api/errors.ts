import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { InvalidInputError, NotFoundError } from './db/tenant';

// A missing route and another organization's resource give the same answer, so a response never
// reveals that something exists elsewhere.
export const notFound: NotFoundHandler = (c) => c.json({ error: 'not_found' }, 404);

/**
 * Whether D1 refused because the free plan's daily rows are used up (#178): "Your account has
 * exceeded D1's free tier daily row read limit…", possibly wrapped by Drizzle as the cause.
 */
export function isDailyLimit(error: unknown) {
  for (let e = error, depth = 0; e instanceof Error && depth < 5; e = e.cause, depth++) {
    if (/exceeded D1's free tier daily/i.test(e.message)) return true;
  }
  return false;
}

/** Seconds until the limits reset, at midnight UTC. */
export const secondsToReset = (now = new Date()) =>
  Math.max(
    60,
    Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000),
  );

export const handleError: ErrorHandler = (error, c) => {
  if (error instanceof NotFoundError) return c.json({ error: 'not_found' }, 404);
  // The app keeps the work on the device and tries again after the reset.
  if (isDailyLimit(error)) {
    console.error('D1 daily limit reached');
    return c.json({ error: 'daily_limit' }, 503, { 'Retry-After': String(secondsToReset()) });
  }
  if (error instanceof InvalidInputError) return c.json({ error: 'invalid_request' }, 400);
  if (error instanceof HTTPException) return error.getResponse();
  console.error('Unhandled error', error);
  return c.json({ error: 'internal' }, 500);
};

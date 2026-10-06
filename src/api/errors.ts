import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { NotFoundError } from './db/tenant';

// A missing route and another organization's resource give the same answer, so a response never
// reveals that something exists elsewhere.
export const notFound: NotFoundHandler = (c) => c.json({ error: 'not_found' }, 404);

export const handleError: ErrorHandler = (error, c) => {
  if (error instanceof NotFoundError) return c.json({ error: 'not_found' }, 404);
  if (error instanceof HTTPException) return error.getResponse();
  console.error('Unhandled error', error);
  return c.json({ error: 'internal' }, 500);
};

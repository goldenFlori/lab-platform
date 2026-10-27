import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { handleError, isDailyLimit, secondsToReset } from '../../src/api/errors';

// #178: when D1's free daily rows are used up, the API says so plainly, with the time to the reset,
// so the app can keep the work on the device and try again then.

const D1 =
  "D1_ERROR: Your account has exceeded D1's free tier daily row write limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.";

describe('the daily limit', () => {
  it('is recognised in D1 errors, also wrapped as a cause', () => {
    expect(isDailyLimit(new Error(D1))).toBe(true);
    expect(isDailyLimit(new Error('Failed query: insert …', { cause: new Error(D1) }))).toBe(true);
    expect(isDailyLimit(new Error('UNIQUE constraint failed'))).toBe(false);
  });

  it('answers 503 daily_limit with the seconds until midnight UTC', async () => {
    const app = new Hono().onError(handleError).get('/', () => {
      throw new Error('Failed query', { cause: new Error(D1) });
    });
    const res = await app.request('/');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'daily_limit' });
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(secondsToReset(new Date('2026-10-27T23:00:00Z'))).toBe(3600);
  });
});

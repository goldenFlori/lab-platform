import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/api';

describe('API routing', () => {
  it('reports health, including the database', async () => {
    const res = await exports.default.fetch('https://lab.test/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', database: 'ok' });
  });

  it('reports a degraded status when the database is unavailable', async () => {
    const brokenDb = {
      prepare() {
        throw new Error('D1 is down');
      },
    } as unknown as D1Database;
    const res = await app.request('/api/health', {}, { DB: brokenDb });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'degraded', database: 'unavailable' });
  });

  it('returns 404 for unknown API routes', async () => {
    const res = await exports.default.fetch('https://lab.test/api/does-not-exist');
    expect(res.status).toBe(404);
  });
});

import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('API routing', () => {
  it('reports health', async () => {
    const res = await exports.default.fetch('https://lab.test/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('returns 404 for unknown API routes', async () => {
    const res = await exports.default.fetch('https://lab.test/api/does-not-exist');
    expect(res.status).toBe(404);
  });
});

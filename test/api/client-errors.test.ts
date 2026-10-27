import { describe, expect, it, vi } from 'vitest';
import { browserOf } from '../../src/api/routes/client-errors';
import { caller } from './http';

// #179: browser errors reach the owner through Workers Logs, as one JSON line each, with where they
// happened and never who; checked like any input, and capped so they cannot flood the logs.

const REPORT = {
  kind: 'error',
  message: "Cannot read properties of undefined (reading 'cells')",
  source: '/assets/index-1a2b3c.js:1:2345',
  page: '/_authed/o/$org/courses/$courseId/labs/$labId',
  build: 'index-1a2b3c',
};
const CHROME = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

describe('browser error reports', () => {
  it('are logged as one line, with the browser and without the user', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await caller()('/client-errors', { method: 'POST', body: REPORT, headers: { 'User-Agent': CHROME } });
    expect(res.status).toBe(204);
    const line = log.mock.calls.map((args) => String(args[0])).find((l) => l.includes('client_error'));
    expect(JSON.parse(line ?? '{}')).toEqual({ type: 'client_error', ...REPORT, browser: 'Chrome 141' });
    log.mockRestore();
  });

  it('refuse what is not a report', async () => {
    const res = await caller()('/client-errors', { method: 'POST', body: { ...REPORT, message: 'x'.repeat(301) } });
    expect(res.status).toBe(400);
  });

  it('stop logging past the cap, with the same answer', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const answers = [];
    for (let i = 0; i < 70; i++)
      answers.push((await caller()('/client-errors', { method: 'POST', body: REPORT })).status);
    expect(new Set(answers)).toEqual(new Set([204]));
    expect(log.mock.calls.filter((args) => String(args[0]).includes('client_error')).length).toBeLessThanOrEqual(60);
    log.mockRestore();
  });

  it('name the browser from its User-Agent', () => {
    expect(browserOf(CHROME)).toBe('Chrome 141');
    expect(browserOf(`${CHROME} Edg/141.0.0.0`)).toBe('Edge 141');
    expect(browserOf('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18.2 Mobile/15E148 Safari/604.1')).toBe(
      'Safari 18',
    );
    expect(browserOf('Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/144.0')).toBe('Firefox 144');
    expect(browserOf(undefined)).toBeNull();
  });
});

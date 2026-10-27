import { describe, expect, it } from 'vitest';
import { jsonObjects, linesOf } from '../../scripts/errors';

// #179: `npm run errors` turns wrangler tail's events into one line per error, and prints nothing
// about the request: not its address, IP or headers.

const REPORT = {
  type: 'client_error',
  kind: 'render',
  message: "Cannot read properties of undefined (reading 'cells')",
  source: '/assets/index-1a2b3c.js:1:2345',
  page: '/_authed/o/$org/courses/$courseId/labs/$labId',
  build: 'index-1a2b3c',
  browser: 'Chrome 141',
};
const EVENT = {
  outcome: 'ok',
  event: { request: { url: 'https://lab.example/api/client-errors', headers: { 'cf-connecting-ip': '203.0.113.7' } } },
  logs: [
    { message: [JSON.stringify(REPORT)], level: 'log', timestamp: 0 },
    { message: ['an ordinary log'], level: 'log', timestamp: 0 },
    { message: ['Unhandled error', { name: 'TypeError' }], level: 'error', timestamp: 0 },
  ],
  exceptions: [{ name: 'Error', message: 'boom', timestamp: 0 }],
};

describe('npm run errors', () => {
  it('prints browser errors and the server’s own, and nothing of the request', () => {
    const text = linesOf(EVENT).join('\n');
    expect(text).toContain('render on /_authed/o/$org/courses/$courseId/labs/$labId (Chrome 141, index-1a2b3c)');
    expect(text).toContain("Cannot read properties of undefined (reading 'cells')");
    expect(text).toContain('at /assets/index-1a2b3c.js:1:2345');
    expect(text).toContain('Unhandled error {"name":"TypeError"}');
    expect(text).toContain('Error: boom');
    expect(text).not.toContain('ordinary log');
    expect(text).not.toContain('203.0.113.7');
    expect(text).not.toContain('lab.example');
  });

  it('finds whole events in a stream split anywhere, braces in strings included', () => {
    const next = jsonObjects();
    const stream = `${JSON.stringify(EVENT, null, 2)}\n${JSON.stringify({ logs: [{ message: ['{ not } json'] }] })}`;
    const events = [stream.slice(0, 37), stream.slice(37, 400), stream.slice(400)].flatMap((part) => next(part));
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(EVENT);
  });
});

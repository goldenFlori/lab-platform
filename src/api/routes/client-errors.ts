import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { clientErrorInput } from '../../shared/client-errors';
import type { AppEnv } from '../env';
import { invalidRequest } from './course-context';

// Browser errors (#179), written to Workers Logs (kept 3 days) as one JSON line each, for
// `npm run errors` and the dashboard. Anyone may report, signed in or not (the sign-in page can fail
// too), so no user is recorded, and each isolate logs at most LOGS_PER_MINUTE: a page stuck in a loop,
// or someone sending many, cannot flood the logs. The answer is the same either way.

const LOGS_PER_MINUTE = 60;
let minute = 0;
let logged = 0;

/** Browsers by what their User-Agent says, most specific first (Edge's also says Chrome). */
const BROWSERS: [string, RegExp][] = [
  ['Edge', /Edg\/(\d+)/],
  ['Opera', /OPR\/(\d+)/],
  ['Samsung Internet', /SamsungBrowser\/(\d+)/],
  ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
  ['Chrome', /(?:CriOS|Chrome)\/(\d+)/],
  ['Safari', /Version\/(\d+).*Safari/],
];

/** The browser and its major version, from the User-Agent: "Chrome 141", "Safari 18". */
export function browserOf(ua: string | undefined) {
  for (const [name, pattern] of BROWSERS) {
    const major = ua?.match(pattern)?.[1];
    if (major) return `${name} ${major}`;
  }
  return null;
}

export const clientErrorRoutes = new Hono<AppEnv>().post(
  '/',
  zValidator('json', clientErrorInput, invalidRequest),
  (c) => {
    const now = Math.floor(Date.now() / 60_000);
    if (now !== minute) [minute, logged] = [now, 0];
    if (logged++ < LOGS_PER_MINUTE) {
      console.log(
        JSON.stringify({
          type: 'client_error',
          ...c.req.valid('json'),
          browser: browserOf(c.req.header('User-Agent')),
        }),
      );
    }
    return c.body(null, 204);
  },
);

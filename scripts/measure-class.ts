// Measures a full class against Cloudflare's free plan (#176):
//
//   npm run measure:class [-- --students 120 --no-build]
//
// It builds the app, starts it on its own local database with the meter on (MEASURE=1), imports the
// course from the converter's fixtures, adds a group of students, and measures what each student
// action costs in Worker requests and D1 rows read and written: API calls as the app makes them, and
// page loads in a real browser. Then it multiplies the costs by a model of a lab hour and a kolokium
// (the counts below, each with its reason) and prints the class's share of the daily limits.

import { parseArgs } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import type { Api } from './course-import/apply.ts';
import { call, fixtureCourse, STUDENT_PASSWORD, signIn, startLocalPlatform } from './lib/local-platform.ts';

const { values: args } = parseArgs({
  options: {
    students: { type: 'string', default: '120' },
    'no-build': { type: 'boolean', default: false },
  },
});
const STUDENTS = Number(args.students);
const PORT = 4192;
const BASE = `http://localhost:${PORT}`;
const PASSWORD = STUDENT_PASSWORD;

/** The free plan's daily limits (re-checked 2026-10-27; see platform-architecture). */
const LIMITS = { requests: 100_000, read: 5_000_000, written: 100_000 };

/**
 * A student's actions in one class, with the app as it is. Since #177 typing (code and graded trace
 * rows together) is saved in one request at most every 30 s, so a student who types the whole time
 * makes 2 saves a minute: the worst case, counted here. Returning to the tab reloads nothing.
 */
const MODEL = {
  'lab hour (60 min)': {
    'open the lab page': 1,
    'open it again (another notebook, a reload)': 2,
    'return to the tab': 15,
    'first save of new cells': 6,
    'later save': 74, // 40 minutes typing, every 30 s, less the first saves
    'report a run': 1,
    'exercise solved': 3,
    'first answer in a visualization': 15,
  },
  'kolokium (90 min)': {
    'open the lab page': 1,
    'open it again (another notebook, a reload)': 1,
    'return to the tab': 5,
    'start the kolokium': 1,
    'first save of new cells': 6,
    'later save with a trace table': 114, // 60 minutes typing, every 30 s, less the first saves
    'report a run': 1,
    'exercise solved': 3,
    'hand in': 1,
  },
} as const;

/** What staff do once per class, not per student. */
const STAFF_MODEL = {
  'lab hour (60 min)': {},
  'kolokium (90 min)': { 'staff follow the kolokium (every 15 s)': 360 },
} as const;

type Cost = { requests: number; queries: number; read: number; written: number };
const costs = new Map<string, Cost>();

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

/* ------------------------------------------------------------ the meter */

const meter = async (method: 'GET' | 'DELETE' = 'GET') =>
  (await (await fetch(`${BASE}/api/__meter`, { method })).json()) as Cost;

/** Runs `action` once per item and keeps its average cost under `name`. Writes done after the
 * response (activity) are waited for. */
async function measure<T>(name: string, items: T[], action: (item: T) => Promise<unknown>) {
  await new Promise((r) => setTimeout(r, 300));
  await meter('DELETE');
  for (const item of items) await action(item);
  await new Promise((r) => setTimeout(r, 300));
  const total = await meter();
  const n = items.length || 1;
  costs.set(name, {
    requests: total.requests / n,
    queries: total.queries / n,
    read: total.read / n,
    written: total.written / n,
  });
}

/* ------------------------------------------------------------ page loads in a browser */

async function pageLoads(urlPath: string, usernames: string[]) {
  const browser = await chromium.launch();
  const pages: Page[] = [];
  for (const username of usernames) {
    const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
    await page.goto(`${BASE}/login`);
    await page.getByLabel('Emri i përdoruesit').fill(username);
    await page.getByLabel('Fjalëkalimi', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Hyr', exact: true }).click();
    await page.waitForURL(`${BASE}/courses`);
    pages.push(page);
  }
  const settle = async (page: Page) => {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  };
  await measure('open the lab page', pages, async (page) => {
    await page.goto(`${BASE}${urlPath}`);
    await settle(page);
  });
  await measure('open it again (another notebook, a reload)', pages, async (page) => {
    await page.reload();
    await settle(page);
  });
  await measure('return to the tab', pages, async (page) => {
    // Hidden, then visible again: what TanStack Query takes for leaving the tab and coming back.
    await page.evaluate(`for (const state of ['hidden', 'visible']) {
      Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    }`);
    await settle(page);
  });
  await browser.close();
}

/* ------------------------------------------------------------ the report */

const fmt = (n: number) => (n >= 100 ? Math.round(n).toLocaleString('en') : n.toFixed(1));
const pct = (n: number, of: number) => `${((100 * n) / of).toFixed(1)}%`;

function table(rows: string[][]) {
  const widths = rows[0]?.map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length))) ?? [];
  for (const row of rows)
    console.log(row.map((cell, i) => (i ? cell.padStart(widths[i] ?? 0) : cell.padEnd(widths[i] ?? 0))).join('   '));
}

function report() {
  console.log('\nCost of one action (average)\n');
  table([
    ['action', 'requests', 'queries', 'rows read', 'rows written'],
    ...[...costs].map(([name, c]) => [name, fmt(c.requests), fmt(c.queries), fmt(c.read), fmt(c.written)]),
  ]);
  for (const [session, actions] of Object.entries(MODEL)) {
    const sum = { requests: 0, read: 0, written: 0 };
    const add = (name: string, times: number, per = 1) => {
      const c = costs.get(name) ?? fail(`No cost measured for "${name}"`);
      sum.requests += c.requests * times * per;
      sum.read += c.read * times * per;
      sum.written += c.written * times * per;
    };
    for (const [name, times] of Object.entries(actions)) add(name, times, STUDENTS);
    for (const [name, times] of Object.entries(STAFF_MODEL[session as keyof typeof STAFF_MODEL])) add(name, times);
    const fits = Math.min(LIMITS.requests / sum.requests, LIMITS.read / sum.read, LIMITS.written / sum.written);
    console.log(`\n${session}, ${STUDENTS} students`);
    table([
      ['', 'requests', 'rows read', 'rows written'],
      ['the class', fmt(sum.requests), fmt(sum.read), fmt(sum.written)],
      [
        'of the daily limit',
        pct(sum.requests, LIMITS.requests),
        pct(sum.read, LIMITS.read),
        pct(sum.written, LIMITS.written),
      ],
    ]);
    console.log(`→ ${fits.toFixed(2)} such classes fit in one day.`);
  }
}

/* ------------------------------------------------------------ run */

const { stop } = await startLocalPlatform({
  port: PORT,
  state: '.wrangler/measure',
  build: !args['no-build'],
  env: { MEASURE: '1' },
});
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));

try {
  const c = await fixtureCourse(BASE, { students: STUDENTS });
  console.log(`Imported the course; ${c.usernames.length} students in Grupi A.`);
  const sessions: Api[] = [];
  await measure('sign in', c.usernames, async (u) => {
    sessions.push(await signIn(BASE, u, PASSWORD));
  });
  await pageLoads(c.pageUrl, c.usernames.slice(0, 5));

  const code = c.detail.exercises[0]?.cell ?? 1;
  const work = (s: Api, n: number, traces: unknown[] = []) =>
    call(s, 'PUT', `${c.nbPath}/work`, { code: [{ cell: code, code: `x = ${n}` }], traces });
  await measure('first save of new cells', sessions, (s) => work(s, 0));
  await measure('later save', sessions, (s) => work(s, 1));
  await measure('report a run', sessions, (s) => call(s, 'POST', `${c.labPath}/activity`, { kind: 'run' }));
  await measure('exercise solved', sessions, (s) => call(s, 'POST', `${c.nbPath}/exercises/${code}/done`));
  const viz = c.detail.embeds.find((e) => e.viz !== 'tabela-gjurmimit')?.cell ?? c.detail.embeds[0]?.cell ?? 0;
  await measure('first answer in a visualization', sessions, (s) =>
    call(s, 'POST', `${c.nbPath}/embeds/${viz}/results`, {
      topic: 'dijkstra',
      decision: 'step-1',
      right: true,
      pick: 'A',
      answer: 'A',
      prompt: 'Which vertex is settled next?',
    }),
  );

  // The kolokium: the trace tables graded, the notebook a 90-minute kolokium for the group.
  const tables = c.detail.embeds.filter((e) => e.viz === 'tabela-gjurmimit');
  await call(c.admin, 'PUT', `${c.nbPath}/embeds`, {
    embeds: c.detail.embeds.map((e) =>
      e.viz === 'tabela-gjurmimit' ? { ...e, props: { ...e.props, points: 10 } } : e,
    ),
  });
  await call(c.admin, 'PUT', `${c.nbPath}/assignments/${c.group.id}`, {
    dueAt: new Date(Date.now() + 3 * 3_600_000).toISOString(),
    kolokium: { opensAt: new Date(Date.now() - 60_000).toISOString(), minutes: 90 },
  });
  await measure('start the kolokium', sessions, (s) => call(s, 'POST', `${c.nbPath}/kolokium/start`));
  // Once with each table's first rows, then the counted save: code and a table, changed.
  for (const s of sessions) await work(s, 2, [{ cell: tables[0]?.cell, rows: [{ chosen: 'A' }] }]);
  await measure('later save with a trace table', sessions, (s) =>
    work(s, 3, [{ cell: tables[0]?.cell, rows: [{ chosen: 'B' }] }]),
  );
  await measure('hand in', sessions, (s) => call(s, 'POST', `${c.nbPath}/submission`));
  await measure('staff follow the kolokium (every 15 s)', [c.admin], (a) =>
    call(a, 'GET', `${c.nbPath}/submissions?group=${c.group.id}`),
  );
  report();
} finally {
  stop();
}

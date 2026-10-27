// Measures a full class against Cloudflare's free plan (#176):
//
//   npm run measure:class [-- --students 120 --no-build]
//
// It builds the app, starts it on its own local database with the meter on (MEASURE=1), imports the
// course from the converter's fixtures, adds a group of students, and measures what each student
// action costs in Worker requests and D1 rows read and written: API calls as the app makes them, and
// page loads in a real browser. Then it multiplies the costs by a model of a lab hour and a kolokium
// (the counts below, each with its reason) and prints the class's share of the daily limits.

import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { hashPassword } from '../src/shared/password.ts';
import { type Api, importCourse } from './course-import/apply.ts';
import { planCourse, type SiteCourse } from './course-import/plan.ts';

const { values: args } = parseArgs({
  options: {
    students: { type: 'string', default: '120' },
    'no-build': { type: 'boolean', default: false },
  },
});
const STUDENTS = Number(args.students);
const PORT = 4192;
const BASE = `http://localhost:${PORT}`;
const STATE = '.wrangler/measure';
const LOG = '.wrangler/measure.log';
const ADMIN = { username: 'measure.admin', password: 'Mat-sakte-2026' };
const PASSWORD = 'Studenti-sakte-2026';

/** The free plan's daily limits (re-checked 2026-10-27; see platform-architecture). */
const LIMITS = { requests: 100_000, read: 5_000_000, written: 100_000 };

/**
 * A student's actions in one class, with the app as it is. Typing saves 0.8 s after each pause in a
 * code cell and 0.7 s after each in a trace table, so saves follow pauses, not minutes; we assume a
 * pause every 10 s while typing. A refocus is a return to the tab, which reloads the page's data.
 */
const MODEL = {
  'lab hour (60 min)': {
    'open the lab page': 1,
    'open it again (another notebook, a reload)': 2,
    'return to the tab': 15,
    'first save of a cell': 6,
    'later code save': 240, // 40 minutes typing, a pause every 10 s
    'report a run': 1,
    'exercise solved': 3,
    'first answer in a visualization': 15,
  },
  'kolokium (90 min)': {
    'open the lab page': 1,
    'open it again (another notebook, a reload)': 1,
    'return to the tab': 5,
    'start the kolokium': 1,
    'first save of a cell': 4,
    'later code save': 360, // 60 minutes typing
    'first save of a trace table': 2,
    'later trace save': 80, // two tables of about 30 cells, some corrected
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

/* ------------------------------------------------------------ the local server */

function startServer(): ChildProcess {
  const steps = [
    `rm -rf ${STATE}`,
    ...(args['no-build'] ? [] : ['npm run build']),
    `npx wrangler d1 migrations apply DB --local --persist-to ${STATE}`,
    `ACCOUNT_PASSWORD=${ADMIN.password} node scripts/create-account.ts --org-slug measure --org-name Measure --username ${ADMIN.username} --full-name "Measure Admin" --role admin --persist-to ${STATE}`,
    `MEASURE=1 CLOUDFLARE_INCLUDE_PROCESS_ENV=true AI_PROVIDER=fake LIVE_JURISDICTION=none LOCAL_STATE=${STATE} npx vite preview --port ${PORT} --strictPort`,
  ];
  mkdirSync('.wrangler', { recursive: true });
  const log = openSync(LOG, 'w');
  // A clean environment: the Worker receives every variable (CLOUDFLARE_INCLUDE_PROCESS_ENV), and npm's
  // own dozens break it.
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
  return spawn('sh', ['-c', steps.join(' && ')], { stdio: ['ignore', log, log], env });
}

async function waitForServer() {
  for (let i = 0; i < 360; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  fail(`The local server did not start; see ${LOG}.`);
}

/* ------------------------------------------------------------ API sessions and the meter */

async function signIn(username: string, password: string): Promise<Api> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) fail(`Sign-in failed for ${username}: ${res.status}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  return (method, path, body, headers = {}) => {
    const bytes = body instanceof Uint8Array;
    return fetch(`${BASE}/api${path}`, {
      method,
      headers: {
        Origin: BASE,
        Cookie: cookie,
        ...(body !== undefined && !bytes ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : bytes ? new Uint8Array(body) : JSON.stringify(body),
    });
  };
}

async function call<T = unknown>(api: Api, method: string, path: string, body?: unknown): Promise<T> {
  const res = await api(method, path, body);
  if (!res.ok) fail(`${method} ${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

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

/* ------------------------------------------------------------ the class */

const FIXTURES = 'test/notebook/fixtures';
const site = JSON.parse(readFileSync(`${FIXTURES}/course.json`, 'utf8')) as Omit<SiteCourse, 'embeds'>;
const read = (file: string) => readFileSync(`${FIXTURES}/${file}`, 'utf8');

async function setUp() {
  const admin = await signIn(ADMIN.username, ADMIN.password);
  const planned = await planCourse({
    site: {
      ...site,
      embeds: JSON.parse(read('embeds.json')),
      platformEmbeds: JSON.parse(read('platform-embeds.json')),
    },
    notebook: (file) => read(`notebooks/${file}`),
    solutions: new Map(),
  });
  const report = await importCourse(admin, {
    org: 'measure',
    title: 'Struktura Diskrete',
    academicYear: '2026/27',
    labs: planned,
  });
  const course = `/orgs/measure/courses/${report.course.id}`;
  // Lab 7: Dijkstra and Bellman-Ford, with code exercises and two trace tables.
  const lab = report.labs.find((l) => l.lab.n === 7) ?? fail('Lab 7 is missing');
  const notebook = lab.notebooks.find((nb) => nb.kind === 'main') ?? fail('Lab 7 has no main notebook');
  const labPath = `${course}/labs/${lab.lab.id}`;
  const nbPath = `${labPath}/notebooks/${notebook.id}`;
  await call(admin, 'PUT', `${labPath}/access`, {
    groupId: null,
    visibleFrom: new Date(Date.now() - 60_000).toISOString(),
    visibleUntil: null,
    solutionsFrom: null,
  });
  const group = await call<{ id: string }>(admin, 'POST', `${course}/groups`, { name: 'Grupi A' });
  const passwordHash = await hashPassword(PASSWORD);
  const usernames: string[] = [];
  for (let i = 0; i < STUDENTS; i += 25) {
    const students = Array.from({ length: Math.min(25, STUDENTS - i) }, (_, k) => ({
      fullName: `Studenti ${i + k + 1}`,
      username: 'studenti',
      passwordHash,
    }));
    const made = await call<{ students: { username: string }[] }>(
      admin,
      'POST',
      `${course}/groups/${group.id}/students`,
      { students },
    );
    usernames.push(...made.students.map((s) => s.username));
  }
  const detail = await call<{
    embeds: { cell: number; viz: string; props: Record<string, unknown> | null }[];
    exercises: { cell: number }[];
  }>(admin, 'GET', nbPath);
  return { admin, report, course, labPath, nbPath, group, usernames, detail, notebookId: notebook.id };
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

const server = startServer();
const stop = () => {
  try {
    // The server runs under sh: stop the whole tree.
    if (server.pid) spawn('pkill', ['-P', String(server.pid)]).on('exit', () => server.kill());
  } catch {
    // Already stopped.
  }
};
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));

try {
  await waitForServer();
  const c = await setUp();
  console.log(`Imported the course; ${c.usernames.length} students in Grupi A.`);
  const sessions: Api[] = [];
  await measure('sign in', c.usernames, async (u) => {
    sessions.push(await signIn(u, PASSWORD));
  });
  await pageLoads(
    `/o/measure/courses/${c.report.course.id}/labs/${c.labPath.split('/').pop()}?notebook=${c.notebookId}`,
    c.usernames.slice(0, 5),
  );

  const code = c.detail.exercises[0]?.cell ?? 1;
  const edit = (s: Api, n: number) => call(s, 'PUT', `${c.nbPath}/edits/${code}`, { code: `x = ${n}` });
  await measure('first save of a cell', sessions, (s) => edit(s, 0));
  await measure('later code save', sessions, (s) => edit(s, 1));
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
  const trace = (s: Api, value: string) =>
    call(s, 'PUT', `${c.nbPath}/embeds/${tables[0]?.cell}/trace`, { rows: [{ chosen: value }] });
  await measure('first save of a trace table', sessions, (s) => trace(s, 'A'));
  await measure('later trace save', sessions, (s) => trace(s, 'B'));
  await measure('hand in', sessions, (s) => call(s, 'POST', `${c.nbPath}/submission`));
  await measure('staff follow the kolokium (every 15 s)', [c.admin], (a) =>
    call(a, 'GET', `${c.nbPath}/submissions?group=${c.group.id}`),
  );
  report();
} finally {
  stop();
}

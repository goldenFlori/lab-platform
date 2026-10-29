// The platform on this machine for the measurement scripts (#176, #190): the production build on its
// own local database, the course from the converter's fixtures, and students signed in through the
// API as the app signs them in.

import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync } from 'node:fs';
import { hashPassword } from '../../src/shared/password.ts';
import { type Api, importCourse } from '../course-import/apply.ts';
import { planCourse, type SiteCourse } from '../course-import/plan.ts';

export const ADMIN = { username: 'measure.admin', password: 'Mat-sakte-2026' };
export const STUDENT_PASSWORD = 'Studenti-sakte-2026';
const ORG = 'measure';

/**
 * Builds (unless `build` is false), migrates a new database in `state`, adds the admin, and serves
 * the build on `port`; `env` reaches the Worker. Stop it with the returned function.
 */
export async function startLocalPlatform(o: {
  port: number;
  state: string;
  build: boolean;
  env?: Record<string, string>;
}) {
  const base = `http://localhost:${o.port}`;
  const log = `${o.state}.log`;
  const vars = Object.entries({
    CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
    AI_PROVIDER: 'fake',
    LIVE_JURISDICTION: 'none',
    LOCAL_STATE: o.state,
    ...o.env,
  })
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  const steps = [
    `rm -rf ${o.state}`,
    ...(o.build ? ['npm run build'] : []),
    `npx wrangler d1 migrations apply DB --local --persist-to ${o.state}`,
    `ACCOUNT_PASSWORD=${ADMIN.password} node scripts/create-account.ts --org-slug ${ORG} --org-name Measure --username ${ADMIN.username} --full-name "Measure Admin" --role admin --persist-to ${o.state}`,
    `${vars} npx vite preview --port ${o.port} --strictPort`,
  ];
  mkdirSync('.wrangler', { recursive: true });
  const out = openSync(log, 'w');
  // A clean environment: the Worker receives every variable (CLOUDFLARE_INCLUDE_PROCESS_ENV), and npm's
  // own dozens break it.
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
  const server: ChildProcess = spawn('sh', ['-c', steps.join(' && ')], { stdio: ['ignore', out, out], env });
  const stop = () => {
    try {
      // The server runs under sh: stop the whole tree.
      if (server.pid) spawn('pkill', ['-P', String(server.pid)]).on('exit', () => server.kill());
    } catch {
      // Already stopped.
    }
  };
  for (let i = 0; i < 360; i++) {
    const up = await fetch(`${base}/api/health`).then(
      (r) => r.ok,
      () => false,
    );
    if (up) return { base, stop };
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  throw new Error(`The local server did not start; see ${log}.`);
}

/** An API session as the app has one: its cookie and our Origin. */
export async function signIn(base: string, username: string, password: string): Promise<Api> {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`Sign-in failed for ${username}: ${res.status}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  return (method, path, body, headers = {}) => {
    const bytes = body instanceof Uint8Array;
    return fetch(`${base}/api${path}`, {
      method,
      headers: {
        Origin: base,
        Cookie: cookie,
        ...(body !== undefined && !bytes ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : bytes ? new Uint8Array(body) : JSON.stringify(body),
    });
  };
}

export async function call<T = unknown>(api: Api, method: string, path: string, body?: unknown): Promise<T> {
  const res = await api(method, path, body);
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const FIXTURES = 'test/notebook/fixtures';
const read = (file: string) => readFileSync(`${FIXTURES}/${file}`, 'utf8');

/**
 * The course from the fixtures, with `lab` open to everyone and a group of `students` imported, as a
 * pedagog imports them. Lab 7 (Dijkstra and Bellman-Ford) has code exercises and two trace tables.
 */
export async function fixtureCourse(base: string, o: { students: number; lab?: number }) {
  const admin = await signIn(base, ADMIN.username, ADMIN.password);
  const site = JSON.parse(read('course.json')) as Omit<SiteCourse, 'embeds'>;
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
    org: ORG,
    title: 'Struktura Diskrete',
    academicYear: '2026/27',
    labs: planned,
  });
  const course = `/orgs/${ORG}/courses/${report.course.id}`;
  const n = o.lab ?? 7;
  const lab = report.labs.find((l) => l.lab.n === n);
  const notebook = lab?.notebooks.find((nb) => nb.kind === 'main');
  if (!lab || !notebook) throw new Error(`Lab ${n} or its notebook is missing`);
  const labPath = `${course}/labs/${lab.lab.id}`;
  const nbPath = `${labPath}/notebooks/${notebook.id}`;
  await call(admin, 'PUT', `${labPath}/access`, {
    groupId: null,
    visibleFrom: new Date(Date.now() - 60_000).toISOString(),
    visibleUntil: null,
    solutionsFrom: null,
  });
  const group = await call<{ id: string }>(admin, 'POST', `${course}/groups`, { name: 'Grupi A' });
  const passwordHash = await hashPassword(STUDENT_PASSWORD);
  const usernames: string[] = [];
  for (let i = 0; i < o.students; i += 25) {
    const students = Array.from({ length: Math.min(25, o.students - i) }, (_, k) => ({
      fullName: `Studenti ${i + k + 1}`,
      username: 'studenti',
      passwordHash,
    }));
    const made = await call<{ students: { username: string }[] }>(
      admin,
      'POST',
      `${course}/groups/${group.id}/students`,
      {
        students,
      },
    );
    usernames.push(...made.students.map((s) => s.username));
  }
  const detail = await call<{
    embeds: { cell: number; viz: string; props: Record<string, unknown> | null }[];
    exercises: { cell: number }[];
  }>(admin, 'GET', nbPath);
  return {
    admin,
    report,
    course,
    labPath,
    nbPath,
    group,
    usernames,
    detail,
    notebookId: notebook.id,
    pageUrl: `/o/${ORG}/courses/${report.course.id}/labs/${lab.lab.id}?notebook=${notebook.id}`,
  };
}

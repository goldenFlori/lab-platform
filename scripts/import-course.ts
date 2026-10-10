// Imports a course site's labs, notebooks, visualizations and solutions into an organization (#16).
// It reads the course repository (site/content/course.mjs, site/content/notebooks/ and the
// git-ignored zgjidhjet/), converts every notebook here, and uploads through the platform's API,
// signed in as a pedagog of the organization:
//
//   npm run course:import -- --from ~/Desktop/discrete-structures-algorithms-course \
//     --org fshn --year 2026/27 --username florjan.mema --url https://lab-platform.florjanimema.workers.dev
//
// Without --url it imports into `npm run dev` (http://localhost:5173). The password is asked for,
// or read from LAB_PASSWORD. --dry-run only shows what would be imported. Running it again updates
// what changed. Labs stay hidden until the pedagog opens them; solutions are for staff only.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { type Api, importCourse } from './course-import/apply.ts';
import { planCourse, type SiteCourse } from './course-import/plan.ts';

const { values: args } = parseArgs({
  options: {
    from: { type: 'string' },
    org: { type: 'string' },
    year: { type: 'string' },
    title: { type: 'string' },
    username: { type: 'string' },
    url: { type: 'string', default: 'http://localhost:5173' },
    'dry-run': { type: 'boolean', default: false },
  },
});

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const from = resolve((args.from ?? fail('--from is required: the course repository')).replace(/^~(?=\/)/, homedir()));
const year = args.year ?? fail('--year is required, for example "2026/27"');
if (!/^\d{4}\/\d{2}$/.test(year)) fail('--year looks like "2026/27"');

const site = (await import(pathToFileURL(join(from, 'site/content/course.mjs')).href)) as {
  course: { title: string };
} & Omit<SiteCourse, 'title'>;
const solutionsDir = join(from, 'zgjidhjet');
const solutions = new Map(
  (existsSync(solutionsDir) ? readdirSync(solutionsDir) : [])
    .filter((file) => file.endsWith('-ZGJIDHJE.ipynb'))
    .map((file) => [file, readFileSync(join(solutionsDir, file), 'utf8')]),
);
const title = args.title ?? site.course.title;

const labs = await planCourse({
  site: { title, labs: site.labs, homework: site.homework, embeds: site.embeds },
  notebook: (file) => readFileSync(join(from, 'site/content/notebooks', file), 'utf8'),
  solutions,
});
console.log(`${title} ${year}: ${labs.length} labs, ${solutions.size} solutions`);
for (const lab of labs) {
  console.log(`  Laboratori ${lab.n}: ${lab.title}`);
  for (const nb of lab.notebooks) {
    const count = nb.embeds.length;
    const viz = count ? `, ${count} visualization${count === 1 ? '' : 's'}` : '';
    console.log(`    ${nb.kind.padEnd(8)} ${nb.title} (${nb.originalName}${viz})`);
  }
}
if (args['dry-run']) process.exit(0);

const org = args.org ?? fail('--org is required: the organization slug, for example "fshn"');
const username = args.username ?? fail('--username is required: a pedagog or admin of the organization');
const base = new URL(args.url).origin;
const password = process.env.LAB_PASSWORD || (await askPassword(`Password for ${username} at ${base}: `));

const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: base },
  body: JSON.stringify({ username, password }),
});
if (!login.ok) fail(`Sign-in failed (${login.status} ${(await login.text()).trim()})`);
const cookie = login.headers
  .getSetCookie()
  .map((c) => c.split(';')[0])
  .join('; ');

const api: Api = (method, path, body, headers = {}) => {
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

try {
  const report = await importCourse(api, { org, title, academicYear: year, labs });
  console.log(`\n${report.created ? 'Created' : 'Found'} the course "${title}" ${year}.`);
  for (const { lab, change, notebooks } of report.labs) {
    console.log(`✔ Laboratori ${lab.n}: ${change}, ${notebooks.length} notebook${notebooks.length === 1 ? '' : 's'}`);
  }
  console.log(
    `\nLabs stay hidden until you open them: ${base}/o/${org}/courses/${report.course.id}\n` +
      'Solutions are shown to staff only, and to students from the date set on each lab.',
  );
} finally {
  await api('POST', '/auth/logout');
}

/** Reads a password from the terminal without echoing it. */
async function askPassword(prompt: string) {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) fail('Set LAB_PASSWORD, or run this in a terminal to type the password');
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  let typed = '';
  for await (const chunk of stdin as AsyncIterable<string>) {
    for (const char of chunk) {
      if (char === '\u0003') {
        stdout.write('\n');
        process.exit(130);
      }
      if (char === '\r' || char === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write('\n');
        return typed;
      }
      typed = char === '\u007f' ? typed.slice(0, -1) : typed + char;
    }
  }
  return typed;
}

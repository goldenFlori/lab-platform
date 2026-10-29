// What a lab room downloads (#190):
//
//   npm run measure:room [-- --students 120 --mbps 100 --no-build]
//
// Builds the app, runs it on its own local database with the course from the fixtures, and opens a lab
// as a student in a real Chromium, as the installed app runs (service worker on): first visit, the
// first Python run, then a second visit. Every byte over the network is sorted by what it is (the app,
// fonts, the Python engine, Python packages from the CDN, the lab's data) and summed. Then the room:
// what `--students` devices starting at once ask of one shared connection of `--mbps`.

import { parseArgs } from 'node:util';
import { brotliCompressSync, constants } from 'node:zlib';
import { chromium, type Request } from '@playwright/test';
import { fixtureCourse, STUDENT_PASSWORD, startLocalPlatform } from './lib/local-platform.ts';

export type Part = 'app code' | 'fonts' | 'Python engine' | 'Python packages' | 'lab data (API)' | 'other';

/** What a URL is, for the room's budget. */
export function partOf(url: string): Part {
  const { hostname, pathname } = new URL(url);
  if (hostname.endsWith('jsdelivr.net') || hostname.endsWith('pythonhosted.org') || hostname === 'pypi.org') {
    return 'Python packages';
  }
  if (pathname.startsWith('/pyodide/')) return 'Python engine';
  if (pathname.startsWith('/api/')) return 'lab data (API)';
  if (/\.(woff2?|ttf|otf)$/.test(pathname)) return 'fonts';
  if (/\.(js|mjs|css)$/.test(pathname) || pathname === '/' || !pathname.includes('.')) return 'app code';
  return 'other';
}

export type Tally = Map<Part, number>;

export const add = (tally: Tally, part: Part, bytes: number) => tally.set(part, (tally.get(part) ?? 0) + bytes);
export const total = (tally: Tally) => [...tally.values()].reduce((a, b) => a + b, 0);

/** Seconds for `devices` to download `bytes` each over a shared `mbps` connection, all at once. */
export const roomSeconds = (bytes: number, devices: number, mbps: number) => (bytes * 8 * devices) / (mbps * 1e6);

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

/** Types Cloudflare compresses on the way (brotli); archives and images go as they are. */
const COMPRESSED = /^(text\/|application\/(javascript|json|wasm|manifest\+json)|image\/svg)/;

/**
 * A response's bytes as production sends them: the local server does not compress, Cloudflare does
 * (brotli, here at level 5; production sends Pyodide's 9.6 MB engine as 3.5 MB).
 */
export function wireBytes(body: Buffer, type: string, encoded: boolean) {
  if (encoded || !COMPRESSED.test(type)) return body.length;
  return brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }).length;
}

/** The course's libraries, imported at once: what a first class's notebooks download in all. */
const COURSE_PACKAGES = "import numpy, networkx, matplotlib.pyplot, plotly\nprint('gati')";

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values: args } = parseArgs({
    options: {
      students: { type: 'string', default: '120' },
      mbps: { type: 'string', default: '100' },
      'no-build': { type: 'boolean', default: false },
    },
  });
  const port = 4195;
  const { base, stop } = await startLocalPlatform({ port, state: '.wrangler/room', build: !args['no-build'] });
  process.on('exit', stop);
  process.on('SIGINT', () => process.exit(130));

  const phases = new Map<string, Tally>();
  /** Every download's size by file name, for the largest. */
  const files = new Map<string, number>();
  let phase = 'first visit: sign in';
  const browser = await chromium.launch();
  try {
    const c = await fixtureCourse(base, { students: 1 });
    // The installed app's way: the service worker on, as on a student's device.
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    // Bytes over the network, the page's and the service worker's: what the room's connection carries.
    const counted = async (request: Request) => {
      const at = phase;
      const sizes = await request.sizes().catch(() => null);
      const response = await request.response().catch(() => null);
      if (!sizes || !response || response.fromServiceWorker()) return;
      const headers = await response.allHeaders();
      // Ours as Cloudflare would send it; the CDN's as it came.
      const ours = new URL(request.url()).origin === base;
      const body = ours && sizes.responseBodySize > 0 ? await response.body().catch(() => null) : null;
      const bytes = body
        ? wireBytes(body, headers['content-type'] ?? '', !!headers['content-encoding'])
        : sizes.responseBodySize;
      const tally = phases.get(at) ?? new Map();
      add(tally, partOf(request.url()), bytes + sizes.responseHeadersSize);
      phases.set(at, tally);
      const name = new URL(request.url()).pathname.split('/').pop() || request.url();
      files.set(name, (files.get(name) ?? 0) + bytes);
    };
    context.on('requestfinished', (request) => void counted(request));
    const page = await context.newPage();
    await page.goto(`${base}/login`);
    await page.getByLabel('Emri i përdoruesit').fill(c.usernames[0] as string);
    await page.getByLabel('Fjalëkalimi', { exact: true }).fill(STUDENT_PASSWORD);
    await page.getByRole('button', { name: 'Hyr', exact: true }).click();
    await page.waitForURL(`${base}/courses`);

    const settle = async () => {
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);
    };
    // The lab's first cell that runs code (the first ones may only show).
    const run = async () => {
      const button = page.getByRole('button', { name: /^Ekzekuto qelizën \d+$/ }).first();
      const n = (await button.getAttribute('aria-label'))?.match(/\d+$/)?.[0];
      await button.click();
      await page.locator(`[data-testid="run-output"][data-cell="${n}"]`).waitFor({ timeout: 180_000 });
      await settle();
    };

    /** The same first cell, edited to import the course's libraries, run. */
    const packages = async () => {
      const button = page.getByRole('button', { name: /^Ndrysho kodin e qelizës \d+$/ }).first();
      const n = (await button.getAttribute('aria-label'))?.match(/\d+$/)?.[0];
      await button.click();
      await page.getByRole('textbox', { name: `Kodi i qelizës ${n}` }).click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type(COURSE_PACKAGES);
      await page.getByRole('button', { name: `Ekzekuto qelizën ${n}` }).click();
      const output = page.locator(`[data-testid="run-output"][data-cell="${n}"]`);
      try {
        await output.filter({ hasText: 'gati' }).waitFor({ timeout: 300_000 });
      } catch (error) {
        console.error(
          `The libraries did not load; cell ${n} says: ${await output.textContent().catch(() => '(nothing)')}`,
        );
        throw error;
      }
      await settle();
    };

    const PHASES = [
      'first visit: sign in',
      'first visit: open the lab',
      'first visit: first Python run',
      "first visit: the course's libraries",
      'second visit: open the lab',
      'second visit: first run with the libraries',
    ];
    phase = PHASES[1] as string;
    await page.goto(`${base}${c.pageUrl}`);
    await settle();
    phase = PHASES[2] as string;
    await run();
    phase = PHASES[3] as string;
    await packages();
    phase = PHASES[4] as string;
    await page.reload();
    await settle();
    phase = PHASES[5] as string;
    await run();

    const students = Number(args.students);
    const mbps = Number(args.mbps);
    const parts: Part[] = ['app code', 'fonts', 'Python engine', 'Python packages', 'lab data (API)', 'other'];
    console.log('\nDownloaded, by part\n');
    const rows = [['', ...parts, 'total']];
    for (const name of PHASES) {
      const tally = phases.get(name) ?? new Map();
      rows.push([name, ...parts.map((p) => mb(tally.get(p) ?? 0)), mb(total(tally))]);
    }
    const widths = rows[0]?.map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length))) ?? [];
    for (const row of rows) {
      console.log(row.map((cell, i) => (i ? cell.padStart(widths[i] ?? 0) : cell.padEnd(widths[i] ?? 0))).join('  '));
    }
    const first = PHASES.slice(0, 4).reduce((n, name) => n + total(phases.get(name) ?? new Map()), 0);
    const again = PHASES.slice(4).reduce((n, name) => n + total(phases.get(name) ?? new Map()), 0);
    console.log('\nThe largest downloads');
    for (const [name, bytes] of [...files].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`  ${mb(bytes).padStart(8)}  ${name}`);
    }
    console.log(`\nA room of ${students} over one ${mbps} Mbit/s connection, all starting at once:`);
    console.log(
      `  first class:   ${mb(first * students)} → about ${Math.ceil(roomSeconds(first, students, mbps) / 60)} min`,
    );
    console.log(`  later classes: ${mb(again * students)} → about ${Math.ceil(roomSeconds(again, students, mbps))} s`);
  } finally {
    await browser.close();
    stop();
  }
}

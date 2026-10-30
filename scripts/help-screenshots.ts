// The guides' pictures (#194), taken from the real app:
//
//   npm run help:screenshots [-- --no-build]
//
// Runs the build on its own local database with the course from the fixtures, signs in as a pedagog
// and as a student, in Albanian and in English, and saves each picture the guides name (SHOTS in
// src/web/i18n/help.sq.ts) to public/help/<locale>/<shot>.jpg. Run it again when the screens change,
// so the guides keep showing what is there.

import { mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { type Browser, chromium, type Page } from '@playwright/test';
import { SHOTS, type Shot } from '../src/web/i18n/help.sq.ts';
import { ADMIN, call, fixtureCourse, STUDENT_PASSWORD, startLocalPlatform } from './lib/local-platform.ts';

const { values: args } = parseArgs({ options: { 'no-build': { type: 'boolean', default: false } } });
const VIEWPORT = { width: 1280, height: 800 };

const { base, stop } = await startLocalPlatform({ port: 4197, state: '.wrangler/help', build: !args['no-build'] });
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));

/** A page signed in as `username`, in `locale`, light theme, at the guides' size. */
async function signedIn(browser: Browser, username: string, password: string, locale: 'sq' | 'en') {
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: 'light', serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel('Emri i përdoruesit').fill(username);
  await page.getByLabel('Fjalëkalimi', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Hyr', exact: true }).click();
  await page.waitForURL(`${base}/courses`);
  // The account's own language, as the account menu sets it.
  await page.request.fetch(`${base}/api/me`, { method: 'PATCH', headers: { Origin: base }, data: { locale } });
  return page;
}

const taken = new Set<Shot>();
async function shoot(page: Page, locale: string, shot: Shot, around?: string) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
  const path = `public/help/${locale}/${shot}.jpg`;
  if (around) {
    // The part the step is about, with some of the page around it.
    const box = await page.locator(around).first().boundingBox();
    if (!box) throw new Error(`${shot}: ${around} is not on the page`);
    const y = Math.max(0, box.y - 120);
    await page.screenshot({
      path,
      type: 'jpeg',
      quality: 75,
      clip: { x: 0, y, width: VIEWPORT.width, height: VIEWPORT.height },
    });
  } else {
    await page.screenshot({ path, type: 'jpeg', quality: 75 });
  }
  taken.add(shot);
  console.log(`✔ ${path}`);
}

const browser = await chromium.launch();
try {
  const c = await fixtureCourse(base, { students: 1, lab: 7 });
  await call(c.admin, 'PUT', `${c.nbPath}/assignments/${c.group.id}`, {
    dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });
  const coursePage = `/o/measure/courses/${c.report.course.id}`;
  const labPage = c.pageUrl;
  for (const locale of ['sq', 'en'] as const) {
    mkdirSync(`public/help/${locale}`, { recursive: true });

    const staff = await signedIn(browser, ADMIN.username, ADMIN.password, locale);
    await staff.goto(`${base}${coursePage}`);
    await shoot(staff, locale, 'course-staff');
    await staff.goto(`${base}${labPage}`);
    await staff.locator('.notebook h2').first().waitFor();
    await shoot(staff, locale, 'lab-staff');
    await staff.goto(`${base}${labPage.replace('?', '/submissions?')}`);
    await shoot(staff, locale, 'submissions');
    await staff.goto(`${base}${coursePage}/groups/${c.group.id}/import`);
    await shoot(staff, locale, 'import');
    await staff.context().close();

    const student = await signedIn(browser, c.usernames[0] as string, STUDENT_PASSWORD, locale);
    await student.goto(`${base}${coursePage}`);
    await shoot(student, locale, 'course-student');
    await student.goto(`${base}${labPage}`);
    await student.locator('.notebook h2').first().waitFor();
    await shoot(student, locale, 'lab-student');
    await shoot(student, locale, 'submission-bar', '[data-testid="submission"]');
    // Lab 7's first exercise check (code cell 7, notebook cell 12): it prints, after the cells above it.
    const cell = student.locator('[data-src="12"]');
    await cell.getByRole('button', { name: /^(Ekzekuto qelizat sipër|Run the cells above)$/ }).click();
    await student
      .locator('[data-testid="run-output"][data-cell="6"]')
      .filter({ hasNotText: '…' })
      .waitFor({ timeout: 180_000 });
    const n = '7';
    await cell.getByRole('button', { name: /^(Ekzekuto qelizën|Run cell) 7$/ }).click();
    const output = student.locator(`[data-testid="run-output"][data-cell="${n}"]`);
    // Until it has run: while Python starts, the output says so with an ellipsis.
    await output.filter({ hasText: /Detyra 1|Task 1/ }).waitFor({ timeout: 180_000 });
    await output.scrollIntoViewIfNeeded();
    await shoot(student, locale, 'run-output', `[data-testid="run-output"][data-cell="${n}"]`);
    await student.goto(`${base}${coursePage}/progress`);
    await shoot(student, locale, 'progress');
    await student.goto(`${base}/ready`);
    await shoot(student, locale, 'ready');
    await student.context().close();
  }
  const missing = SHOTS.filter((s) => !taken.has(s));
  if (missing.length) throw new Error(`No picture for: ${missing.join(', ')}`);
} finally {
  await browser.close();
  stop();
}

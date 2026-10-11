import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { type ImportReport, importCourse } from '../scripts/course-import/apply';
import { type PlannedLab, planCourse, type SiteCourse } from '../scripts/course-import/plan';
import { detectExercises } from '../src/notebook/exercises';
import type { GroupView } from '../src/shared/courses';
import type { NotebookSummary } from '../src/shared/notebooks';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { apiCall, pageApi, signIn } from './sign-in';

// #16 is done when the platform shows the same labs as the course site, behind login, and #14 when
// every course notebook renders with its visualizations, without errors and without overflow on a
// phone. The course site's labs, notebooks and embeds are the converter's fixtures.

const FIXTURES = 'test/notebook/fixtures';
const site = JSON.parse(readFileSync(`${FIXTURES}/course.json`, 'utf8')) as Omit<SiteCourse, 'embeds'>;
const embeds = JSON.parse(readFileSync(`${FIXTURES}/embeds.json`, 'utf8')) as SiteCourse['embeds'];
const notebook = (file: string) => readFileSync(`${FIXTURES}/notebooks/${file}`, 'utf8');

test.describe.configure({ mode: 'serial' });

let staff: Page;
let planned: PlannedLab[];
let report: ImportReport;
let courseUrl: string;
const errors: string[] = [];

test.beforeAll(async ({ browser }, testInfo) => {
  testInfo.setTimeout(300_000);
  staff = await signIn(browser, E2E_STAFF, Boolean(testInfo.project.use.isMobile));
  staff.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  planned = await planCourse({
    site: { ...site, embeds },
    notebook,
    // The real solutions never enter this repository; Lab 10's own notebook stands in for its own.
    solutions: new Map([['laborator-10-ZGJIDHJE.ipynb', notebook('laborator-10.ipynb')]]),
  });
  report = await importCourse(pageApi(staff), {
    org: 'e2e',
    title: `${site.title} ${crypto.randomUUID().slice(0, 6)}`,
    academicYear: '2026/27',
    labs: planned,
  });
  courseUrl = `/o/e2e/courses/${report.course.id}`;
});

test.afterAll(async () => {
  await staff?.context().close();
});

test('the course has the same labs as the site, and importing it again changes nothing', async () => {
  expect(report.created).toBe(true);
  await staff.goto(courseUrl);
  for (const lab of site.labs) await expect(staff.getByRole('link', { name: lab.title, exact: true })).toBeVisible();
  expect(report.labs.map(({ lab }) => [lab.n, lab.title])).toEqual(site.labs.map((lab) => [lab.n, lab.title]));
  // Labs 5 and 6 share one notebook on the site; each lab holds its own part, with its visualizations.
  const [lab5, lab6] = [5, 6].map((n) => planned.find((lab) => lab.n === n)?.notebooks[0]);
  expect(lab5?.embeds.map((e) => e.viz)).toEqual(['labirinti', 'grafet', 'grafet']);
  expect(lab6?.embeds.map((e) => e.viz)).toEqual(['scc-topologjike', 'scc-topologjike', 'scc-topologjike']);

  const again = await importCourse(pageApi(staff), {
    org: 'e2e',
    title: report.course.title,
    academicYear: '2026/27',
    labs: planned,
  });
  expect(again.created).toBe(false);
  expect(again.labs.map((l) => l.change)).toEqual(site.labs.map(() => 'unchanged'));
  const ids = (r: ImportReport) => r.labs.flatMap((l) => l.notebooks.map((nb) => nb.id));
  expect(ids(again)).toEqual(ids(report));
});

test('students see only opened labs and their notebooks, never the solutions; visitors must sign in', async ({
  browser,
  isMobile,
}) => {
  const coursePath = `/orgs/e2e/courses/${report.course.id}`;
  const group = await apiCall<GroupView>(staff, 'POST', `${coursePath}/groups`, { name: 'Grupi A' });
  const lab10 = report.labs.find(({ lab }) => lab.n === 10);
  if (!lab10) throw new Error('Lab 10 was not imported');
  await apiCall(staff, 'PUT', `${coursePath}/labs/${lab10.lab.id}/access`, {
    groupId: null,
    visibleFrom: new Date(Date.now() - 60_000).toISOString(),
    visibleUntil: null,
    solutionsFrom: null,
  });

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(courseUrl);
  await expect(student.getByRole('link', { name: lab10.lab.title, exact: true })).toBeVisible();
  await expect(student.getByRole('link', { name: site.labs[0]?.title ?? '', exact: true })).toHaveCount(0);
  const { notebooks } = await apiCall<{ notebooks: NotebookSummary[] }>(
    student,
    'GET',
    `${coursePath}/labs/${lab10.lab.id}/notebooks`,
  );
  expect(notebooks.map((nb) => nb.kind)).toEqual(['main']);
  await student.context().close();

  const visitor = await browser.newPage();
  await visitor.goto(`${courseUrl}/labs/${lab10.lab.id}`);
  await expect(visitor).toHaveURL(/\/login/);
  await visitor.context().close();
});

for (const lab of site.labs) {
  test(`Laboratori ${lab.n}: every notebook renders with its visualizations`, async () => {
    const imported = report.labs.find((l) => l.lab.n === lab.n);
    const plan = planned.find((l) => l.n === lab.n);
    if (!imported || !plan) throw new Error(`Lab ${lab.n} was not imported`);
    for (const [i, nb] of imported.notebooks.entries()) {
      errors.length = 0;
      await staff.goto(`${courseUrl}/labs/${imported.lab.id}?notebook=${nb.id}`);
      await expect(staff.locator('article .notebook')).toBeVisible();

      // Every embed is placed, and every visualization opens when it scrolls into view.
      const expected = plan.notebooks[i]?.embeds ?? [];
      const placed = staff.locator('article [data-viz-id]');
      await expect(placed).toHaveCount(expected.length);
      for (const [j, embed] of expected.entries()) {
        const viz = placed.nth(j);
        await expect(viz).toHaveAttribute('data-viz-id', embed.viz);
        await viz.scrollIntoViewIfNeeded();
        await expect(viz.getByRole('region')).toBeVisible();
      }

      // Every exercise the notebook checks itself is one (#51).
      const stored = plan.notebooks[i]?.stored;
      await expect(staff.locator('article [data-testid="exercise"]')).toHaveCount(
        stored ? detectExercises(stored).length : 0,
      );

      const overflow = () =>
        staff.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(await overflow(), nb.originalName).toBeLessThanOrEqual(0);
      // Text comes out slightly wider on some systems (CI's Linux among them), so the page must still
      // fit with every letter a little wider.
      await staff.addStyleTag({ content: '* { letter-spacing: 0.25px !important; }' });
      expect(await overflow(), nb.originalName).toBeLessThanOrEqual(0);
      expect(errors.filter((text) => !text.startsWith('Failed to load resource'))).toEqual([]);
    }
  });
}

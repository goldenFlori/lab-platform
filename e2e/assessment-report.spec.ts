import { readFile } from 'node:fs/promises';
import { type Browser, expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, newStudent, signIn } from './sign-in';

// #170: after a graded hand-in, staff see per trace table row how many got it right and the most
// common mistake, from five students up, and the group's grades CSV carries the trace points.

const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '## Kolokium' },
    { cell_type: 'markdown', source: 'Gjurmoni Prim-in.' },
  ],
  nbformat: 4,
});
// Prim from A on Lab 5's graph: the edges it takes and the running total.
const PRIM = [
  { edge: 'A-C', total: '1' },
  { edge: 'C-E', total: '3' },
  { edge: 'C-D', total: '7' },
  { edge: 'B-D', total: '10' },
];

/** A student's API session, signed in without the login page. */
async function studentSession(browser: Browser, account: { username: string; password: string }) {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await apiCall(page, 'POST', '/auth/login', account);
  return page;
}

test('staff read how a group did on each trace table row, and take the trace points in the CSV', async ({
  browser,
  isMobile,
}) => {
  test.setTimeout(120_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group, labPath, pageUrl } = await courseWithLab(staff, 'Report e2e', { open: true });
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Kolokium',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  const nbPath = `${labPath}/notebooks/${nb.id}`;
  await apiCall(staff, 'PUT', `${nbPath}/embeds`, {
    embeds: [{ cell: 1, viz: 'tabela-gjurmimit', props: { preset: 'lab05-prim', points: 10 } }],
  });
  await apiCall(staff, 'PUT', `${nbPath}/assignments/${group.id}`, {
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
  });

  // Five hand in: four with 99 as the last total, one right.
  for (const [i, name] of ['Ana', 'Besa', 'Dritan', 'Erion', 'Gent'].entries()) {
    const account = await newStudent(staff, `/orgs/e2e/courses/${course.id}`, group.id, `Raport ${name}`);
    const student = await studentSession(browser, account);
    const rows = i < 4 ? PRIM.map((r, k) => (k === 3 ? { ...r, total: '99' } : r)) : PRIM;
    await apiCall(student, 'PUT', `${nbPath}/embeds/1/trace`, { rows });
    await apiCall(student, 'POST', `${nbPath}/submission`);
    const me = await apiCall<{ user: { id: string } }>(student, 'GET', '/me');
    await apiCall(staff, 'PUT', `${nbPath}/grades/${me.user.id}`, { autoScore: 0, maxScore: 0, results: [] });
    await student.context().close();
  }

  await staff.goto(`${pageUrl}/submissions?notebook=${nb.id}`);
  const report = staff.getByTestId('assessment-report');
  await expect(report.getByRole('heading', { name: 'Raporti i vlerësimit' })).toBeVisible();
  await expect(report.getByTestId('report-counts')).toHaveText('5 nga 5 dorëzuan · 5 të vlerësuar');
  const last = report.getByRole('row', { name: /Hapi 4/ });
  await expect(last).toContainText('1/5');
  await expect(last).toContainText('Pesha deri tani = 99 (4 studentë)');
  await expect(report.getByRole('row', { name: /Hapi 1/ })).toContainText('5/5');
  // Counts only: no student's name in the report.
  await expect(report).not.toContainText('Raport Ana');

  const download = staff.waitForEvent('download');
  await staff.getByRole('button', { name: 'Shkarko notat (CSV)' }).click();
  const csv = await readFile((await (await download).path()) ?? '', 'utf8');
  expect(csv).toContain('Tabelat e gjurmimit');
  expect(csv).toContain('Maksimumi i tabelave');

  const overflow = await staff.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await staff.context().close();
});

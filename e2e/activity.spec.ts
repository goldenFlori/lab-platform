import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import type { ActivityReport } from '../src/shared/activity';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #18 is done when the pedagog sees weekly activity for their course: a student opens a lab,
// downloads its notebook and tries its visualization, and the pedagog sees it counted, without
// the student's name.

test('a student works in a lab and the pedagog sees it in the course activity', async ({ browser, isMobile }) => {
  test.setTimeout(90_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group, labPath, pageUrl } = await courseWithLab(staff, 'Activity e2e', { open: true });
  const raw = JSON.stringify({
    cells: [
      { cell_type: 'markdown', source: '# Renditja\n\nInsertion Sort hap pas hapi.' },
      { cell_type: 'code', source: 'print(sorted([3, 1, 2]))', outputs: [] },
    ],
    nbformat: 4,
  });
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Renditja',
    raw,
    stored: toStored(await renderNotebook(raw)),
  });
  await apiCall(staff, 'PUT', `${labPath}/notebooks/${nb.id}/embeds`, {
    embeds: [{ cell: 1, viz: 'renditja', title: 'Insertion Sort', props: null }],
  });
  const activity = `/orgs/e2e/courses/${course.id}/activity`;

  // The student: opens the lab, downloads the notebook, steps through the visualization.
  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(pageUrl);
  const download = student.waitForEvent('download');
  await student.getByRole('link', { name: 'Shkarko fletoren' }).click();
  await download;
  const viz = student.locator('[data-viz-id="renditja"]').getByRole('region');
  await viz.scrollIntoViewIfNeeded();
  await viz.getByRole('button').first().click();
  // Students have no way to the activity page.
  await student.goto(`/o/e2e/courses/${course.id}`);
  await expect(student.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(student.getByRole('link', { name: 'Aktiviteti' })).toHaveCount(0);
  expect((await student.request.get(`/api${activity}`)).status()).toBe(403);
  await student.context().close();

  // The writes land after the responses; wait for them before looking.
  await expect
    .poll(async () => (await apiCall<ActivityReport>(staff, 'GET', activity)).labs[0], { timeout: 10_000 })
    .toMatchObject({ view: 1, download: 1, visualization: 1 });

  await staff.goto(`/o/e2e/courses/${course.id}`);
  await staff.getByRole('link', { name: 'Aktiviteti' }).click();
  await expect(staff.getByRole('heading', { name: 'Aktiviteti', level: 1 })).toBeVisible();
  await expect(staff.getByText('Studentë', { exact: true }).locator('..')).toContainText('1');
  await expect(staff.getByText('Aktivë këtë javë').locator('..')).toContainText('100% e studentëve');
  const row = staff.getByRole('table', { name: 'Aktiviteti sipas laboratorit' }).getByRole('row', {
    name: /Algoritmet e renditjes/,
  });
  await expect(row.getByRole('cell')).toHaveText(['1 / 1', '1 / 1', '1 / 1', '0 / 1']);
  await expect(staff.getByText(E2E_ACCOUNT.fullName)).toHaveCount(0);
  const overflow = await staff.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await staff.context().close();
});

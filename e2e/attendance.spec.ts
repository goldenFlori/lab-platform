import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #222: a lab hour's register on the group page, filled in from who opened the lab that day; staff
// change a mark and download the term; the student sees their own attendance.

test('a pedagog keeps the attendance of a lab hour', async ({ browser, isMobile }) => {
  test.setTimeout(120_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group, labPath, pageUrl } = await courseWithLab(staff, 'Prezenca e2e', { open: true });
  // Opening a lab counts when its notebook opens.
  const raw = JSON.stringify({
    cells: [
      { cell_type: 'markdown', source: '# Renditja\n\nSot renditim lista.' },
      { cell_type: 'code', source: 'print(sorted([3, 1, 2]))', outputs: [] },
    ],
    nbformat: 4,
  });
  await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Renditja',
    raw,
    stored: toStored(await renderNotebook(raw)),
  });

  // The student opens the lab today.
  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(pageUrl);
  await expect(student.locator('article .notebook')).toBeVisible();

  await staff.goto(`/o/e2e/courses/${course.id}/groups/${group.id}`);
  const section = staff.getByTestId('attendance');
  await section.getByRole('button', { name: 'Hap regjistrin' }).click();
  const mark = section.getByRole('combobox', { name: /^Prezenca e Studenti Testues më / });
  await expect(mark).toHaveValue('present');
  await mark.selectOption('excused');
  await expect(mark).toHaveValue('excused');

  const [download] = await Promise.all([
    staff.waitForEvent('download'),
    section.getByRole('button', { name: 'Shkarko prezencën (CSV)' }).click(),
  ]);
  const csv = await readFile((await download.path()) as string, 'utf8');
  expect(csv).toContain(`${E2E_ACCOUNT.username},${E2E_ACCOUNT.fullName},I justifikuar,0`);
  await staff.context().close();

  await student.goto(`/o/e2e/courses/${course.id}/progress`);
  await expect(student.getByTestId('my-attendance')).toContainText('I justifikuar');
  await student.context().close();
});

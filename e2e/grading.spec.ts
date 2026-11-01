import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #53 is done when a pedagog grades a group's submissions in one batch run and the students see
// their grades. #114: the pedagog takes them to the records as CSV, for the group and the course.

async function downloaded(page: Page, button: string) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: button }).click();
  return readFile((await (await download).path()) ?? '', 'utf8');
}

const code = (source: string) => ({ cell_type: 'code', source, outputs: [] });
const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '## Ushtrimi 1 — Shuma' },
    code('def shuma(a, b):\n    # PLOTESO\n    raise NotImplementedError'),
    code(
      'def _testet():\n    assert shuma(1, 2) == 3, "shuma(1, 2) duhet 3"\n\nkontrollo("Ushtrimi 1 — Shuma", _testet)',
    ),
  ],
  nbformat: 4,
});

test('a pedagog grades a group in one batch, releases, and the student sees the grade', async ({
  browser,
  isMobile,
}) => {
  test.setTimeout(150_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group, labPath, pageUrl } = await courseWithLab(staff, 'Grading e2e', { open: true });
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Detyra',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  const nbPath = `${labPath}/notebooks/${nb.id}`;
  await apiCall(staff, 'PUT', `${nbPath}/assignments/${group.id}`, {
    dueAt: new Date(Date.now() + 3600_000).toISOString(),
  });

  // The student's answer, handed in.
  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await apiCall(student, 'PUT', `${nbPath}/edits/1`, { code: 'def shuma(a, b):\n    return a + b' });
  await apiCall(student, 'POST', `${nbPath}/submission`);

  // Two points, and a hidden test the student never saw.
  await staff.goto(`${pageUrl}/submissions?notebook=${nb.id}`);
  await staff.getByText('Vlerësimi: pikët dhe testet e fshehura').click();
  const setup = staff.getByRole('form', { name: 'Vlerësimi: pikët dhe testet e fshehura' });
  await setup.getByLabel('Pikët').fill('2');
  await setup.locator('textarea').fill('assert shuma(-1, 1) == 0');
  await setup.getByRole('button', { name: 'Ruaj vlerësimin' }).click();
  await expect(setup.getByText('Vlerësimi u ruajt.')).toBeVisible();

  // One batch over the group, in this browser.
  await staff.getByRole('button', { name: 'Vlerëso Grupi A' }).click();
  await expect(staff.getByText('U vlerësuan 1 dorëzime.')).toBeVisible({ timeout: 120_000 });
  const grade = staff.getByTestId('grade');
  await expect(grade).toContainText('2/2');
  await expect(grade).toContainText('Pa publikuar');

  // A comment beside the student's cell (#220).
  const row = staff.getByTestId('submission-row').filter({ hasText: E2E_ACCOUNT.fullName });
  await row.getByRole('button', { name: `Shiko dorëzimin e ${E2E_ACCOUNT.fullName}` }).click();
  await row.getByRole('button', { name: 'Shto koment' }).click();
  await row.getByLabel('Komenti për këtë qelizë').fill('Shumë mirë; provoje edhe me numra negativë.');
  await row.getByRole('button', { name: 'Ruaj komentin' }).click();
  await expect(row.getByTestId('cell-comment')).toContainText('provoje edhe me numra negativë');

  await staff.getByRole('button', { name: 'Publiko notat' }).click();
  await staff.getByRole('alertdialog').getByRole('button', { name: 'Publiko notat' }).click();
  await expect(grade).toContainText('Publikuar');

  const groupCsv = await downloaded(staff, 'Shkarko notat (CSV)');
  expect(groupCsv).toContain('Përdoruesi,Emri i plotë,Nota,Maksimumi,Publikuar,Vlerësuar më');
  expect(groupCsv).toContain(`${E2E_ACCOUNT.username},${E2E_ACCOUNT.fullName},2,2,Po,`);
  await staff.goto(`/o/e2e/courses/${course.id}`);
  const courseCsv = await downloaded(staff, 'Notat (CSV)');
  expect(courseCsv).toContain('Lab 1 · Detyra (/2),Gjithsej');
  expect(courseCsv).toContain(`Grupi A,${E2E_ACCOUNT.username},${E2E_ACCOUNT.fullName},2,2`);

  await student.goto(pageUrl);
  await expect(student.getByTestId('my-grade')).toContainText('Nota juaj: 2/2');
  await expect(student.getByTestId('grade-comment')).toContainText('provoje edhe me numra negativë');
  await student.context().close();
  await staff.context().close();
});

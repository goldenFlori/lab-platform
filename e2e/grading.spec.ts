import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #53 is done when a pedagog grades a group's submissions in one batch run and the students see
// their grades.

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
  const { group, labPath, pageUrl } = await courseWithLab(staff, 'Grading e2e', { open: true });
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

  await staff.getByRole('button', { name: 'Publiko notat' }).click();
  await staff.getByRole('alertdialog').getByRole('button', { name: 'Publiko notat' }).click();
  await expect(grade).toContainText('Publikuar');

  await student.goto(pageUrl);
  await expect(student.getByTestId('my-grade')).toContainText('Nota juaj: 2/2');
  await student.context().close();
  await staff.context().close();
});

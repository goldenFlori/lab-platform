import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #52 is done when students submit, staff list the submissions per group, and no student can see
// another's work.

const code = (source: string) => ({ cell_type: 'code', source, outputs: [] });
const NOTEBOOK = JSON.stringify({
  cells: [{ cell_type: 'markdown', source: '## Ushtrimi 1' }, code('def shuma(a, b):\n    raise NotImplementedError')],
  nbformat: 4,
});

const editor = (page: Page) => page.getByRole('textbox', { name: 'Kodi i qelizës 1' });

/** Tomorrow at 23:59, as a datetime-local input takes it. */
function tomorrow() {
  const date = new Date(Date.now() + 24 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T23:59`;
}

async function handIn(page: Page, button: string) {
  await page.getByTestId('submission').getByRole('button', { name: button }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: button }).click();
  await expect(page.getByTestId('submission')).toContainText('Puna u dorëzua.');
}

test('students hand in their work until the deadline; staff list it per group', async ({ browser, isMobile }) => {
  test.setTimeout(120_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { group, labPath, pageUrl } = await courseWithLab(staff, 'Submissions e2e', { open: true });
  await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Detyra',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });

  // The pedagog opens the notebook for submission to the group, until tomorrow night.
  await staff.goto(pageUrl);
  await staff.getByText('Dorëzimi i kësaj fletoreje').click();
  const groupForm = staff.getByRole('form', { name: 'Grupi A' });
  await groupForm.getByLabel('Afati për Grupi A').fill(tomorrow());
  await groupForm.getByRole('button', { name: 'Hap dorëzimin' }).click();
  await expect(groupForm).toContainText('Hapur deri më');
  await expect(staff.getByText('Dorëzimi i kësaj fletoreje · hapur për 1 grup')).toBeVisible();

  // The student changes the code and hands it in, then again.
  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(pageUrl);
  const bar = student.getByTestId('submission');
  await expect(bar).toContainText('Afati:');
  await expect(bar).toContainText('Ende pa dorëzuar.');
  await student.getByRole('button', { name: 'Ndrysho kodin e qelizës 1' }).click();
  await editor(student).click();
  await student.keyboard.press('ControlOrMeta+a');
  await student.keyboard.type('def shuma(a, b): return a + b');
  // Handed in at once, without waiting for the autosave: the last change is saved first.
  await handIn(student, 'Dorëzo punën');
  await expect(bar).toContainText('Dorëzuat më');
  await handIn(student, 'Dorëzo përsëri');
  await expect(bar).toContainText('(2 herë)');
  await student.reload();
  await expect(student.getByTestId('submission')).toContainText('(2 herë)');

  // A student cannot see the submissions.
  await student.goto(`${pageUrl}/submissions`);
  await expect(student.getByText('Nuk keni të drejtë të shihni dorëzimet e këtij laboratori.')).toBeVisible();
  await student.context().close();

  // The pedagog sees who handed in, and reads the code.
  await staff.goto(pageUrl);
  await staff.getByText('Dorëzimi i kësaj fletoreje').click();
  await staff.getByRole('link', { name: 'Shiko dorëzimet' }).click();
  await expect(staff.getByRole('heading', { name: 'Dorëzimet', level: 1 })).toBeVisible();
  await expect(staff.getByTestId('submission-count')).toHaveText('1 nga 1 e dorëzuan');
  const row = staff.getByTestId('submission-row').filter({ hasText: E2E_ACCOUNT.fullName });
  await expect(row).toContainText('2 herë');
  await row.getByRole('button', { name: `Shiko dorëzimin e ${E2E_ACCOUNT.fullName}` }).click();
  await expect(row.getByText('def shuma(a, b): return a + b')).toBeVisible();
  await expect(row.getByText('Qeliza 1')).toBeVisible();
  // The hand-in as an .ipynb (#214), the student's code in its cell.
  const [download] = await Promise.all([
    staff.waitForEvent('download'),
    row.getByRole('button', { name: 'Shkarko si .ipynb' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`\\(${E2E_ACCOUNT.fullName}\\)\\.ipynb$`));
  const handedIn = await readFile((await download.path()) as string, 'utf8');
  expect(handedIn).toContain('def shuma(a, b): return a + b');

  const overflow = await staff.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await staff.context().close();
});

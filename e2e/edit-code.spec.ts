import { expect, type Page, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #49 is done when a student's edits survive a reload and another device, and staff cannot read them.

const code = (source: string) => ({ cell_type: 'code', source, outputs: [] });
const NOTEBOOK = JSON.stringify({ cells: [code('x = 21'), code('print(x * 2)')], nbformat: 4 });

const editor = (page: Page, n: number) => page.getByRole('textbox', { name: `Kodi i qelizës ${n}` });
const output = (page: Page, n: number) => page.locator(`[data-testid="run-output"][data-cell="${n}"]`);

async function retype(page: Page, n: number, text: string) {
  await editor(page, n).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

test('a student edits code, runs it, finds it again on any device; staff see the original', async ({
  browser,
  isMobile,
}) => {
  test.setTimeout(150_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { group, labPath, pageUrl } = await courseWithLab(staff, 'Edit code e2e', { open: true });
  await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Ndrysho',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(pageUrl);

  // Edit the second cell; it saves on its own, and runs as edited.
  await student.getByRole('button', { name: 'Ndrysho kodin' }).nth(1).click();
  await expect(editor(student, 2)).toBeFocused();
  await retype(student, 2, 'print(x * 3)');
  await expect(student.getByText('Keni ndryshuar 1 qelizë')).toBeVisible();
  await expect(student.getByTestId('edits-saving')).toHaveText('U ruajt në llogarinë tuaj');
  await student.getByRole('button', { name: 'Ekzekuto qelizën 1' }).click();
  await student.getByRole('button', { name: 'Ekzekuto qelizën 2' }).click();
  await expect(output(student, 2)).toContainText('63', { timeout: 90_000 });

  // A reload, and another device, bring the edit back.
  await student.reload();
  await expect(editor(student, 2)).toContainText('print(x * 3)');
  const elsewhere = await signIn(browser, E2E_ACCOUNT, isMobile);
  await elsewhere.goto(pageUrl);
  await expect(editor(elsewhere, 2)).toContainText('print(x * 3)');
  await elsewhere.context().close();

  // The pedagog sees the notebook's own code, not the student's.
  await staff.goto(pageUrl);
  await expect(staff.locator('.nb-shiki').nth(1)).toContainText('print(x * 2)');
  await expect(staff.getByText('Keni ndryshuar')).toHaveCount(0);

  // Back to the original, for one cell, and it stays so.
  await student.getByRole('button', { name: 'Rikthe kodin origjinal' }).click();
  await expect(student.locator('.nb-shiki').nth(1)).toContainText('print(x * 2)');
  await student.reload();
  await expect(editor(student, 2)).toHaveCount(0);

  // Or everything at once, after a confirmation.
  await student.getByRole('button', { name: 'Ndrysho kodin' }).first().click();
  await retype(student, 1, 'x = 1');
  await expect(student.getByTestId('edits-saving')).toHaveText('U ruajt në llogarinë tuaj');
  await student.getByRole('button', { name: 'Rikthe gjithë kodin origjinal' }).click();
  await student.getByRole('alertdialog').getByRole('button', { name: 'Rikthe gjithë kodin origjinal' }).click();
  await expect(student.getByText('Keni ndryshuar')).toHaveCount(0);
  await student.reload();
  await expect(student.locator('.nb-shiki').first()).toContainText('x = 21');

  const overflow = await student.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await student.context().close();
  await staff.context().close();
});

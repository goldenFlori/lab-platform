import { expect, type Page, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import type { ActivityReport } from '../src/shared/activity';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #51 is done when a student solves an exercise of a supplementary notebook and sees it checked, and
// the pedagog sees how many completed it.

const md = (source: string) => ({ cell_type: 'markdown', source });
const code = (source: string) => ({ cell_type: 'code', source, outputs: [] });
// As the course's supplementary notebooks are made: a helper, the exercise, then its check.
const NOTEBOOK = JSON.stringify({
  cells: [
    md('# Ushtrime shtesë'),
    code('def kontrollo(titulli, testet):\n    testet()\n    print("✓", titulli)'),
    md('## Ushtrimi 1 — Shuma'),
    code('def shuma(a, b):\n    # PLOTESO\n    raise NotImplementedError'),
    code(
      'def _testet():\n    assert shuma(1, 2) == 3, "shuma(1, 2) duhet të japë 3"\n\nkontrollo("Ushtrimi 1 — Shuma", _testet)',
    ),
    md('## Ushtrimi 2 — Prodhimi'),
    code('def prodhimi(a, b):\n    return ___'),
  ],
  nbformat: 4,
});

const editor = (page: Page, n: number) => page.getByRole('textbox', { name: `Kodi i qelizës ${n}` });
const output = (page: Page, n: number) => page.locator(`[data-testid="run-output"][data-cell="${n}"]`);
const check = (page: Page, n: number) => output(page, n).getByTestId('check-result');
const run = (page: Page, n: number) => page.getByRole('button', { name: `Ekzekuto qelizën ${n}` }).click();

async function rewrite(page: Page, n: number, text: string) {
  if (!(await editor(page, n).isVisible())) {
    await page.getByRole('button', { name: `Ndrysho kodin e qelizës ${n}` }).click();
  }
  await editor(page, n).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

test('a student solves exercises and sees them checked; the pedagog sees how many solved each', async ({
  browser,
  isMobile,
}) => {
  test.setTimeout(180_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group, labPath, pageUrl } = await courseWithLab(staff, 'Exercises e2e', { open: true });
  await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Ushtrime',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });

  // The check in the notebook was found at upload; the pedagog adds the second exercise with a test.
  await staff.goto(pageUrl);
  await staff.getByText('Ushtrimet në këtë fletore (1)').click();
  const form = staff.getByRole('form', { name: 'Ushtrimet në këtë fletore' });
  await expect(form.getByLabel('Titulli', { exact: true }).first()).toHaveValue('Ushtrimi 1 — Shuma');
  await form.getByRole('button', { name: 'Shto ushtrim' }).click();
  const second = form.getByRole('group', { name: 'Ushtrimi 2' });
  const cell = second.locator('select');
  const choice = await cell.locator('option', { hasText: 'Ushtrimi 2 — Prodhimi' }).getAttribute('value');
  await cell.selectOption(choice ?? '');
  await second.getByLabel('Titulli', { exact: true }).fill('Ushtrimi 2 — Prodhimi');
  await second.locator('textarea').fill('assert prodhimi(2, 3) == 6, "prodhimi(2, 3) duhet të japë 6"');
  await form.getByRole('button', { name: 'Ruaj ushtrimet' }).click();
  await expect(form.getByText('Ushtrimet u ruajtën.')).toBeVisible();
  await expect(staff.getByTestId('exercise')).toHaveCount(2);

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(pageUrl);
  await expect(student.getByTestId('exercise')).toHaveCount(2);

  // The check before the cells above ran: what is missing, and a way to run them.
  await run(student, 3);
  await expect(check(student, 3)).toHaveAttribute('data-status', 'error', { timeout: 90_000 });
  await expect(check(student, 3)).toContainText("NameError: name 'shuma' is not defined");
  await check(student, 3).getByRole('button', { name: 'Ekzekuto qelizat sipër' }).click();
  await expect(output(student, 2)).toBeVisible();
  await run(student, 3);
  await expect(check(student, 3)).toHaveAttribute('data-status', 'todo');
  await expect(check(student, 3)).toContainText('Ende pa plotësuar');

  // A wrong answer shows the case that failed; the right one passes and is kept.
  await rewrite(student, 2, 'def shuma(a, b):\n    return a - b');
  await run(student, 2);
  await run(student, 3);
  await expect(check(student, 3)).toHaveAttribute('data-status', 'fail');
  await expect(check(student, 3)).toContainText('shuma(1, 2) duhet të japë 3');
  await rewrite(student, 2, 'def shuma(a, b):\n    return a + b');
  await run(student, 2);
  await run(student, 3);
  await expect(check(student, 3)).toHaveAttribute('data-status', 'pass');
  await expect(check(student, 3)).toContainText('Të gjitha testet kaluan!');

  // The pedagog's visible test runs after the student's cell.
  await rewrite(student, 4, 'def prodhimi(a, b):\n    return a * b');
  await run(student, 4);
  await expect(check(student, 4)).toHaveAttribute('data-status', 'pass');

  // Solved stays solved, on any device.
  await expect(student.getByTestId('exercise').filter({ hasText: 'E zgjidhur' })).toHaveCount(2);
  await student.reload();
  await expect(student.getByTestId('exercise').filter({ hasText: 'E zgjidhur' })).toHaveCount(2);
  await student.context().close();

  // The pedagog sees how many solved each, and the course activity counts it.
  await staff.reload();
  await expect(staff.getByTestId('exercise').filter({ hasText: '1 nga 1 studentë e kanë zgjidhur' })).toHaveCount(2);
  await expect
    .poll(
      async () =>
        (await apiCall<ActivityReport>(staff, 'GET', `/orgs/e2e/courses/${course.id}/activity`)).labs[0]?.exercise,
    )
    .toBe(1);

  const overflow = await staff.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await staff.context().close();
});

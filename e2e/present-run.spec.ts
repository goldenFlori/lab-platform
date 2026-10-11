import { expect, type Page, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { signIn } from './sign-in';

// #50 is done when a whole lab can be run step by step from the presenter with the keyboard alone.

const md = (source: string) => ({ cell_type: 'markdown', source });
const code = (source: string, outputs: unknown[] = []) => ({ cell_type: 'code', source, outputs });
const notebook = (shuma: string) =>
  JSON.stringify({
    cells: [
      md('## Llogaritje'),
      code('x = 21'),
      code('print(x * 2)', [{ output_type: 'stream', name: 'stdout', text: '42\n' }]),
      code(`def shuma(a, b):\n    ${shuma}\n\nshuma(x, 1)`),
      code('1 / 0'),
    ],
    nbformat: 4,
  });

const counter = (page: Page) => page.getByTestId('presentation-step');
const output = (page: Page, n: number) => page.locator(`[data-testid="run-output"][data-cell="${n}"]`);

test('a lab runs step by step from the presenter, with the keyboard alone', async ({ browser, isMobile }) => {
  test.setTimeout(150_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { labPath, pageUrl } = await courseWithLab(staff, 'Present run e2e');
  const exercise = notebook('pass');
  const solved = notebook('return a + b');
  const main = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Llogaritje',
    raw: exercise,
    stored: toStored(await renderNotebook(exercise)),
  });
  await uploadNotebook(staff, labPath, {
    kind: 'solution',
    title: 'Llogaritje (zgjidhje)',
    raw: solved,
    stored: toStored(await renderNotebook(solved)),
  });

  await staff.goto(`${pageUrl}/present?notebook=${main.id}`);
  await expect(counter(staff)).toHaveText('1 / 5');

  // A code step without a saved output: → moves on, R runs it and starts Python.
  await staff.keyboard.press('ArrowRight');
  await expect(counter(staff)).toHaveText('2 / 5');
  await staff.keyboard.press('r');
  await expect(output(staff, 1)).toContainText('✓', { timeout: 90_000 });

  // The next step runs in the same namespace; its run stands in for the saved output.
  await staff.keyboard.press('ArrowRight');
  await expect(counter(staff)).toHaveText('3 / 5');
  await staff.keyboard.press('r');
  await expect(output(staff, 2)).toContainText('42');
  await expect(staff.getByRole('button', { name: 'Shfaq rezultatin (Hapësira)' })).toHaveCount(0);
  // Projector sizes, as for the saved outputs.
  const size = await output(staff, 2)
    .locator('.run-text')
    .first()
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(15);

  // A step that ran shows its own output, so → moves straight on. With the solution shown, R runs
  // the solved code.
  await staff.keyboard.press('ArrowRight');
  await expect(counter(staff)).toHaveText('4 / 5');
  await staff.keyboard.press('s');
  await expect(staff.getByRole('button', { name: 'Zgjidhja' })).toHaveAttribute('aria-pressed', 'true');
  await staff.keyboard.press('r');
  await expect(output(staff, 3)).toContainText('22');
  await staff.keyboard.press('s');

  // A failing run shows its error plainly: where, then what.
  await staff.keyboard.press('ArrowRight');
  await expect(counter(staff)).toHaveText('5 / 5');
  await staff.keyboard.press('r');
  const error = output(staff, 4).getByRole('alert');
  await expect(error).toContainText('<cell 4>');
  await expect(error.getByText('ZeroDivisionError: division by zero', { exact: true })).toHaveCSS('font-weight', '600');

  // Back to a step that ran: its output is still there.
  await staff.keyboard.press('ArrowLeft');
  await expect(output(staff, 3)).toContainText('22');

  const overflow = await staff.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await staff.context().close();
});

import { expect, type Page, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #47 is done when a student runs a notebook's code cells in the browser and sees their output, and
// a runaway loop can be stopped.

const code = (source: string) => ({ cell_type: 'code', source, outputs: [] });
const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '# Python në shfletues' },
    code('x = 21\nprint("gati")'),
    code('x * 2'),
    code('1 / 0'),
    code('while True:\n    x += 1'),
    code('emri = input("Emri: ")\nprint("Përshëndetje", emri)'),
  ],
  nbformat: 4,
});

const run = (page: Page, n: number) => page.getByRole('button', { name: `Ekzekuto qelizën ${n}` }).click();
/** The output of code cell n's latest run. */
const output = (page: Page, n: number) => page.locator(`[data-testid="run-output"][data-cell="${n}"]`);

test('a student runs the cells, sees errors plainly, stops a loop and answers input()', async ({
  browser,
  isMobile,
}) => {
  test.setTimeout(150_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { group, labPath, pageUrl } = await courseWithLab(staff, 'Python e2e', { open: true });
  await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Python',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  await staff.context().close();

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(pageUrl);
  // Isolated, so Stop keeps the namespace and input() can ask.
  expect(await student.evaluate(() => crossOriginIsolated)).toBe(true);

  // The first run starts Python; the namespace carries over to the next cell.
  await run(student, 1);
  await expect(output(student, 1)).toContainText('gati', { timeout: 90_000 });
  await expect(student.getByText('Python është gati')).toBeVisible();
  await run(student, 2);
  await expect(output(student, 2)).toContainText('42');

  // An error names the cell and leaves out Pyodide's own frames.
  await run(student, 3);
  const error = output(student, 3);
  await expect(error).toContainText('ZeroDivisionError');
  await expect(error).toContainText('<cell 3>');
  await expect(error).not.toContainText('_pyodide');

  // A loop that never ends: Stop interrupts it, and the variables survive.
  await run(student, 4);
  await expect(student.getByRole('button', { name: 'Ndalo' })).toBeVisible();
  await student.waitForTimeout(500);
  await student.getByRole('button', { name: 'Ndalo' }).click();
  await expect(output(student, 4)).toContainText('Ekzekutimi u ndal.', { timeout: 10_000 });
  await run(student, 2);
  await expect(output(student, 2)).toContainText(/\d{3,}/);

  // input() asks on the page.
  await run(student, 5);
  const answer = student.getByRole('textbox', { name: 'Përgjigja për input()' });
  await expect(answer).toBeFocused();
  await answer.fill('Ana');
  await answer.press('Enter');
  await expect(output(student, 5)).toContainText('Përshëndetje Ana');

  // A fresh Python forgets x; running the cells above brings it back.
  await student.getByRole('button', { name: 'Rinis Python-in' }).click();
  await run(student, 2);
  await expect(output(student, 2)).toContainText("NameError: name 'x' is not defined", { timeout: 90_000 });
  await student.getByRole('button', { name: 'Ekzekuto qelizat sipër' }).nth(1).click();
  await run(student, 2);
  await expect(output(student, 2)).toContainText('42');

  const overflow = await student.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await student.context().close();
});

test('the labs’ libraries load as needed, and their figures show in place', async ({ browser, isMobile }) => {
  test.setTimeout(300_000);
  const notebook = JSON.stringify({
    cells: [
      code('import numpy as np\nnp.arange(5).sum()'),
      code('import matplotlib.pyplot as plt\nplt.plot([1, 2, 3], [1, 4, 9])\nplt.title("Katror")\nplt.show()'),
      code('import plotly.graph_objects as go\nfig = go.Figure(go.Scatter(x=[1, 2, 3], y=[1, 4, 9]))\nfig.show()'),
      code('import time\nt0 = time.perf_counter()\nsum(range(10**5))\nprint(time.perf_counter() > t0)'),
    ],
    nbformat: 4,
  });
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { pageUrl, labPath } = await courseWithLab(staff, 'Python figures e2e');
  await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Figura',
    raw: notebook,
    stored: toStored(await renderNotebook(notebook)),
  });
  await staff.goto(pageUrl);

  await run(staff, 1);
  await expect(output(staff, 1)).toContainText('10', { timeout: 120_000 });
  await run(staff, 2);
  await expect(output(staff, 2).getByRole('img', { name: 'Figura e prodhuar nga kodi juaj' })).toBeVisible({
    timeout: 120_000,
  });
  // Only the figure: no warnings from the drawing backend.
  await expect(output(staff, 2).locator('pre')).toHaveCount(0);
  await run(staff, 3);
  await output(staff, 3).scrollIntoViewIfNeeded();
  await expect(output(staff, 3).locator('.pf-plot .main-svg').first()).toBeVisible({ timeout: 120_000 });
  // Installing plotly is not the student's output.
  await expect(output(staff, 3)).not.toContainText('Loading');
  await run(staff, 4);
  await expect(output(staff, 4)).toContainText('True');
  await expect(output(staff, 4)).toContainText('Në shfletues kodi ecën më ngadalë');
  await staff.context().close();
});

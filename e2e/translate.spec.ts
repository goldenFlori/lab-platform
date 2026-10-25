import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #88 is done when a pedagog translates a notebook, edits a part and saves it, and the copy's code
// still runs. (The model is the fake one, which writes "EN:" before each part: src/api/ai/provider.ts.)

const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '# Renditja\n\nÇdo element futet në vendin e tij.' },
    { cell_type: 'code', source: '# Shuma e listës\nprint(sum([1, 2, 3]))', outputs: [] },
  ],
  nbformat: 4,
});

test('a pedagog translates a notebook, edits it and saves it; its code still runs', async ({ browser, isMobile }) => {
  test.setTimeout(150_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, labPath, pageUrl } = await courseWithLab(staff, 'Translate e2e');
  await apiCall(staff, 'PATCH', `/orgs/e2e/courses/${course.id}`, { ai: true });
  await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Renditja',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });

  await staff.goto(pageUrl);
  // From the lab header's AI menu (#98, #130).
  await staff.getByRole('button', { name: 'Mjetet me AI' }).click();
  await staff.getByRole('menuitem', { name: /Përkthe fletoren/ }).click();
  const panel = staff.getByTestId('translate');
  await panel.getByRole('button', { name: 'Përkthe', exact: true }).click();
  const first = panel.getByLabel('Përkthimi i pjesës 1');
  await expect(first).toHaveValue(/^EN: # Renditja/);
  await first.fill('# Sorting\n\nEach element goes into its place.');
  await expect(panel.getByLabel('Titulli i fletores së re')).toHaveValue('Renditja (English)');
  await panel.getByRole('button', { name: 'Ruaj si fletore të re' }).click();

  await expect(staff.getByRole('link', { name: 'Renditja (English)' })).toBeVisible();
  await expect(staff.getByText('Each element goes into its place.')).toBeVisible();
  await staff.getByRole('button', { name: 'Ekzekuto qelizën 1' }).click();
  await expect(staff.locator('[data-testid="run-output"][data-cell="1"]')).toContainText('6', { timeout: 90_000 });
  await staff.context().close();
});

import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #85 is done when a pedagog makes a variant of an exercise, sees its tests pass against the
// reference solution, and saves it as a new notebook with its solution. (The model is the fake one,
// which writes a sound variant: src/api/ai/provider.ts.)

const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '# Ushtrime\n\n## Ushtrimi 1 — Shuma\n\nShkruani `shuma(a, b)`.' },
    { cell_type: 'code', source: 'def shuma(a, b):\n    pass', outputs: [] },
  ],
  nbformat: 4,
});

test('a pedagog makes a variant of an exercise, checks it and saves it', async ({ browser, isMobile }) => {
  test.setTimeout(180_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, labPath, pageUrl } = await courseWithLab(staff, 'Variant e2e');
  await apiCall(staff, 'PATCH', `/orgs/e2e/courses/${course.id}`, { ai: true });
  const notebook = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Ushtrime',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  await apiCall(staff, 'PUT', `${labPath}/notebooks/${notebook.id}/exercises`, {
    exercises: [{ cell: 1, title: 'Ushtrimi 1 — Shuma', test: 'assert shuma(1, 2) == 3' }],
  });

  await staff.goto(pageUrl);
  await staff.getByText('Ushtrimet në këtë fletore (1)').click();
  const variant = staff.getByTestId('variant');
  await variant.getByRole('button', { name: 'Bëj një variant' }).click();
  await expect(variant.getByLabel('Titulli')).toHaveValue('Shuma e numrave çift');
  const check = variant.getByTestId('variant-check');
  await expect(check).toContainText('Zgjidhja i kalon të gjitha testet.', { timeout: 120_000 });
  await expect(check).toContainText('Kodi fillestar nuk i kalon testet');

  await variant.getByRole('button', { name: 'Ruaj si fletore të re' }).click();
  // The new notebook opens, with its exercise; its solution notebook is beside it.
  await expect(staff).toHaveURL(/notebook=/);
  await expect(staff.getByText(/Ushtrim:\s*Shuma e numrave çift/).first()).toBeVisible();
  await expect(staff.getByRole('link', { name: 'Zgjidhja · Shuma e numrave çift' })).toBeVisible();
  await staff.context().close();
});

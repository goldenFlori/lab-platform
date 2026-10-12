import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #98 is done when, on a notebook whose exercises were never saved, a pedagog saves them with one
// click and reaches "Make a variant" from the lab header's AI menu.

const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '## Ushtrimi 1 — Shuma' },
    { cell_type: 'code', source: 'def shuma(a, b):\n    raise NotImplementedError', outputs: [] },
    {
      cell_type: 'code',
      source: 'def _testet():\n    assert shuma(1, 2) == 3\n\nkontrollo("Ushtrimi 1 — Shuma", _testet)',
      outputs: [],
    },
  ],
  nbformat: 4,
});

test('a pedagog saves the exercises found and opens the copilot from the AI menu', async ({ browser, isMobile }) => {
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, labPath, pageUrl } = await courseWithLab(staff, 'Tools e2e');
  await apiCall(staff, 'PATCH', `/orgs/e2e/courses/${course.id}`, { ai: true });
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Ushtrime',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  // As if imported before exercises existed.
  await apiCall(staff, 'PUT', `${labPath}/notebooks/${nb.id}/exercises`, { exercises: [] });

  await staff.goto(pageUrl);
  const found = staff.getByTestId('exercises-found');
  await expect(found).toContainText('Kjo fletore ka një ushtrim me kontroll');
  await found.getByRole('button', { name: 'Ruaji ushtrimet' }).click();
  await expect(found).toHaveCount(0);
  await expect(staff.getByText('Ushtrimet në këtë fletore (1)')).toBeVisible();

  await staff.getByRole('button', { name: 'Mjetet me AI' }).click();
  await staff.getByRole('menuitem', { name: /Variant i një ushtrimi/ }).click();
  await expect(staff.getByTestId('variant').getByRole('button', { name: 'Bëj një variant' })).toBeInViewport();
  await staff.context().close();
});

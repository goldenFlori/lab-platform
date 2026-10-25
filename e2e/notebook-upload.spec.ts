import { expect, test } from '@playwright/test';
import { E2E_STAFF } from './account';
import { courseWithLab } from './notebooks';
import { signIn } from './sign-in';

test('a pedagog uploads a notebook, places a visualization in it and deletes it', async ({ browser, isMobile }) => {
  test.setTimeout(120_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { pageUrl } = await courseWithLab(staff, 'Notebook upload e2e');
  await staff.goto(pageUrl);
  await expect(staff.getByText('Ky laborator nuk ka ende fletore.')).toBeVisible();

  // Upload: converted in this browser, then sent in steps.
  // From the lab header's "More" menu (#130).
  await staff.getByRole('button', { name: 'Më shumë veprime me fletoret' }).click();
  await staff.getByRole('menuitem', { name: 'Ngarko fletore' }).click();
  const form = staff.getByRole('form', { name: 'Ngarko fletore' });
  await form.getByLabel('Fletorja (.ipynb)').setInputFiles('test/notebook/fixtures/notebooks/laborator-03.ipynb');
  await expect(form.getByLabel('Lloji')).toHaveValue('main');
  await form.getByRole('button', { name: 'Ngarko' }).click();
  await expect(staff).toHaveURL(/\?notebook=/, { timeout: 60_000 });
  await expect(staff.getByRole('link', { name: 'Shkarko fletoren' })).toBeVisible();
  await expect(staff.locator('article .notebook')).toBeVisible();
  await expect(staff.locator('article [data-viz-id]')).toHaveCount(0);

  // Place a visualization: invalid settings are refused, then a good one is saved and shown.
  await staff.getByText('Vizualizimet në këtë fletore (0)').click();
  const editor = staff.getByRole('form', { name: 'Vizualizimet në këtë fletore' });
  await editor.getByRole('button', { name: 'Shto vizualizim' }).click();
  await editor.getByRole('combobox', { name: /^Qeliza/ }).selectOption('2');
  await editor.getByRole('combobox', { name: /^Vizualizimi/ }).selectOption('gara-e-krahasimeve');
  await editor.getByLabel("Titulli (s'është i detyrueshëm)").fill('Gara e krahasimeve');
  await editor.getByLabel(/Cilësimet/).fill('jo json');
  await editor.getByRole('button', { name: 'Ruaj vizualizimet' }).click();
  await expect(editor.getByText(/duhet të jenë JSON/)).toBeVisible();
  await editor.getByLabel(/Cilësimet/).fill('{"n": 16}');
  await editor.getByRole('button', { name: 'Ruaj vizualizimet' }).click();
  await expect(editor.getByText('Vizualizimet u ruajtën.')).toBeVisible();
  await expect(staff.getByText('Vizualizimet në këtë fletore (1)')).toBeVisible();
  await expect(staff.locator('article [data-viz-id="gara-e-krahasimeve"]')).toHaveCount(1);
  await expect(staff.getByText(/· Gara e krahasimeve$/)).toBeVisible();

  // Still there after a reload.
  await staff.reload();
  await expect(staff.locator('article [data-viz-id="gara-e-krahasimeve"]')).toHaveCount(1);

  // Delete: the lab is empty again.
  await staff.getByRole('button', { name: 'Më shumë veprime me fletoret' }).click();
  await staff.getByRole('menuitem', { name: 'Fshi fletoren' }).click();
  await staff.getByRole('alertdialog').getByRole('button', { name: 'Fshi fletoren' }).click();
  await expect(staff.getByText('Ky laborator nuk ka ende fletore.')).toBeVisible();

  const overflow = await staff.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await staff.context().close();
});

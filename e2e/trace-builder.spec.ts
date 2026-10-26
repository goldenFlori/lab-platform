import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { signIn } from './sign-in';

// #166: a pedagog builds a trace problem of their own in the embeds editor, and the lab shows it.

const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '## Punë në Klasë' },
    { cell_type: 'markdown', source: 'Gjurmoni algoritmin me dorë.' },
  ],
  nbformat: 4,
});

test('a pedagog builds their own trace problem and it shows in the lab', async ({ browser, isMobile }) => {
  test.setTimeout(120_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { labPath, pageUrl } = await courseWithLab(staff, 'Trace builder e2e');
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Punë në klasë',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  await staff.goto(`${pageUrl}?notebook=${nb.id}`);

  await staff.getByText('Vizualizimet në këtë fletore (0)').click();
  const editor = staff.getByRole('form', { name: 'Vizualizimet në këtë fletore' });
  await editor.getByRole('button', { name: 'Shto vizualizim' }).click();
  await editor.getByRole('combobox', { name: /^Qeliza/ }).selectOption('1');
  await editor.getByRole('combobox', { name: /^Vizualizimi/ }).selectOption('tabela-gjurmimit');
  await editor.getByRole('button', { name: 'Ndërto problemin' }).click();

  // Start from Lab 5's graph, and ask for Kruskal on it instead of Prim.
  const builder = editor.getByTestId('trace-builder');
  await builder.getByRole('button', { name: /Një problem i laboratorit/ }).click();
  await staff.getByRole('option', { name: 'Lab 5 · Prim nga A' }).click();
  await builder.getByRole('button', { name: /Algoritmi/ }).click();
  await staff.getByRole('option', { name: 'Kruskal', exact: true }).click();
  await expect(builder).toContainText('Gati: studentët plotësojnë 4 rreshta.');

  await editor.getByRole('button', { name: 'Ruaj vizualizimet' }).click();
  await expect(editor.getByText('Vizualizimet u ruajtën.')).toBeVisible();

  // The lab shows the pedagog's problem, with its own rule and no list of course problems.
  const trace = staff.locator('article [data-viz-id="tabela-gjurmimit"]');
  await expect(trace).toContainText('Brinjët shqyrtohen sipas peshës; në barazim, sipas rendit të listës.');
  await expect(trace.getByRole('button', { name: /Problemi$/ })).toHaveCount(0);
  await trace.getByLabel('Hapi 1 · Brinja').fill('A-C');
  await trace.getByLabel('Hapi 1 · Vendimi').fill('pranohet');
  await trace.getByLabel('Hapi 1 · Pesha deri tani').fill('1');
  await trace.getByRole('button', { name: 'Kontrollo rreshtin' }).click();
  await expect(trace).toContainText('Saktë: Hapi 1.');
  await staff.context().close();
});

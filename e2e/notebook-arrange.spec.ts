import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #233: the lab's notebooks renamed and reordered in place.

const notebook = (text: string) =>
  JSON.stringify({ cells: [{ cell_type: 'markdown', source: `# ${text}\n\nTekst.` }], nbformat: 4 });

test('a pedagog renames and reorders the lab’s notebooks', async ({ browser, isMobile }) => {
  test.setTimeout(120_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { labPath, pageUrl } = await courseWithLab(staff, 'Radha e2e');
  for (const [kind, title] of [
    ['main', 'Fletorja kryesore'],
    ['extra', 'Ushtrime shtesë'],
  ] as const) {
    const raw = notebook(title);
    await uploadNotebook(staff, labPath, { kind, title, raw, stored: toStored(await renderNotebook(raw)) });
  }
  await staff.goto(pageUrl);
  await staff.getByRole('button', { name: 'Më shumë veprime me fletoret' }).click();
  await staff.getByRole('menuitem', { name: 'Rendit dhe riemërto fletoret' }).click();
  const panel = staff.getByTestId('notebooks-arrange');
  await panel.getByLabel('Titulli i fletores 2').fill('Ushtrime për shtëpi');
  await panel.getByRole('button', { name: 'Lëviz lart: Ushtrime për shtëpi' }).click();
  await panel.getByRole('button', { name: 'Ruaj' }).click();
  await expect(panel).toHaveCount(0);

  const list = await apiCall<{ notebooks: { title: string }[] }>(staff, 'GET', `${labPath}/notebooks`);
  expect(list.notebooks.map((n) => n.title)).toEqual(['Ushtrime për shtëpi', 'Fletorja kryesore']);
  await expect(staff.getByRole('link', { name: /Ushtrime për shtëpi/ })).toBeVisible();
  await staff.context().close();
});

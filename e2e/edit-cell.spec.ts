import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #232: a pedagog fixes a typo in a cell on the lab page; the notebook is a new version, and a
// student's code in another cell stays where it was.

const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '# Renditja' },
    { cell_type: 'markdown', source: 'Renditja me futje krahason çdo element me ata para tij.' },
    { cell_type: 'markdown', source: 'Ky paragraf ka nje gabim shtypi.' },
    { cell_type: 'code', source: 'x = 1\nprint(x)', outputs: [] },
  ],
  nbformat: 4,
});

test('a pedagog fixes a cell in the browser, and a student keeps their code', async ({ browser, isMobile }) => {
  test.setTimeout(120_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { group, labPath, pageUrl } = await courseWithLab(staff, 'Qeliza e2e', { open: true });
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Renditja',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await apiCall(student, 'PUT', `${labPath}/notebooks/${nb.id}/work`, {
    code: [{ cell: 3, code: 'print("kodi im")' }],
    traces: [],
    version: nb.version,
  });

  await staff.goto(`${pageUrl}?notebook=${nb.id}`);
  await staff.getByRole('button', { name: 'Më shumë veprime me fletoret' }).click();
  await staff.getByRole('menuitem', { name: 'Ndrysho qelizat' }).click();
  await expect(staff.getByTestId('cell-edit-banner')).toBeVisible();
  // The typo's paragraph: the title becomes the page's heading, so the first paragraph's button comes first.
  await staff.getByRole('button', { name: 'Ndrysho këtë qelizë' }).nth(1).click();
  const source = staff.getByTestId('cell-edit').getByLabel('Burimi i qelizës');
  await expect(source).toHaveValue('Ky paragraf ka nje gabim shtypi.');
  await source.fill('Ky paragraf ka një gabim më pak.');
  await staff.getByRole('button', { name: 'Ruaj qelizën' }).click();
  // Converted again in this browser, then put in place: longer than a click. The form closes, and the
  // notebook, not the form, shows the new text.
  await expect(staff.getByTestId('cell-edit')).toHaveCount(0, { timeout: 30_000 });
  await expect(staff.locator('.nb-prose', { hasText: 'Ky paragraf ka një gabim më pak.' })).toBeVisible();
  await staff.getByRole('button', { name: 'Mbaro' }).click();
  await expect(staff.getByTestId('cell-edit-banner')).toHaveCount(0);
  await staff.context().close();

  await student.goto(`${pageUrl}?notebook=${nb.id}`);
  await expect(student.locator('.nb-prose', { hasText: 'Ky paragraf ka një gabim më pak.' })).toBeVisible();
  await expect(student.getByText('print("kodi im")')).toBeVisible();
  await student.context().close();
});

import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #167: a trace table asked as a variant gives each student their own graph; staff look any of them up.

const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '## Kolokium' },
    { cell_type: 'markdown', source: 'Gjurmoni Kruskal-in mbi grafin tuaj.' },
  ],
  nbformat: 4,
});

test('every student gets their own trace problem, and staff can look it up', async ({ browser, isMobile }) => {
  test.setTimeout(120_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group, lab, labPath, pageUrl } = await courseWithLab(staff, 'Trace variants e2e', { open: true });
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Kolokium',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  await apiCall(staff, 'PUT', `${labPath}/notebooks/${nb.id}/embeds`, {
    embeds: [
      { cell: 1, viz: 'tabela-gjurmimit', props: { variant: { algorithm: 'kruskal', nodes: 6, directed: false } } },
    ],
  });

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(`/o/e2e/courses/${course.id}/labs/${lab.id}?notebook=${nb.id}`);
  const mine = student.locator('article [data-viz-id="tabela-gjurmimit"]');
  await expect(mine.getByRole('img', { name: 'Varianti juaj · Kruskal' })).toBeVisible();
  // A student sees neither the picker nor the key.
  await expect(mine.getByTestId('trace-key')).toHaveCount(0);
  const studentEdges = await mine.getByRole('img', { name: 'Varianti juaj · Kruskal' }).textContent();
  await student.context().close();

  await staff.goto(`${pageUrl}?notebook=${nb.id}`);
  const trace = staff.locator('article [data-viz-id="tabela-gjurmimit"]');
  await trace.getByRole('button', { name: /Varianti i/ }).click();
  await staff.getByRole('option', { name: E2E_ACCOUNT.fullName }).click();
  // The student's graph, with its expected table for staff.
  await expect(trace.getByRole('img', { name: 'Varianti juaj · Kruskal' })).toHaveText(studentEdges ?? '');
  await trace
    .getByTestId('trace-key')
    .getByText(/Tabela e pritur/)
    .click();
  await expect(trace.getByTestId('trace-key')).toContainText('Hapi 5');
  await staff.context().close();
});

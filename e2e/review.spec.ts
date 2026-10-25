import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #152: a student reviews the algorithms of the labs they opened, one question at a time.

const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '## Grafet' },
    { cell_type: 'code', source: 'G = {}', outputs: [] },
  ],
  nbformat: 4,
});

test('a student reviews the algorithms of the labs they opened', async ({ browser, isMobile }) => {
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group, labPath } = await courseWithLab(staff, 'Review e2e', { open: true });
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Grafet',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  await apiCall(staff, 'PUT', `${labPath}/notebooks/${nb.id}/embeds`, {
    embeds: [{ cell: 1, viz: 'kruskal-prim', title: null, props: null }],
  });
  await staff.context().close();

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await apiCall(student, 'GET', `${labPath}/notebooks/${nb.id}`);
  await student.goto(`/o/e2e/courses/${course.id}`);
  await student.getByRole('link', { name: 'Përsërit' }).click();
  await expect(student.getByRole('heading', { name: 'Përsëritje', level: 1 })).toBeVisible();

  const review = student.getByTestId('review');
  // Two topics, at most three questions each.
  await expect(review).toContainText('Pyetja 1 nga 6');
  // Kruskal or Prim, on a fresh graph: any answer gets its verdict and the explanation.
  await review.getByRole('group').getByRole('button').first().click();
  await expect(student.getByTestId('review-feedback')).toBeVisible();
  await review.getByRole('button', { name: 'Vazhdo' }).click();
  await expect(review).toContainText('Pyetja 2 nga 6');
  await student.context().close();
});

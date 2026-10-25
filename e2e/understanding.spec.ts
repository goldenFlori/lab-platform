import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #151: a student's first answer in an embedded visualization counts in "My understanding".

const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '## Selection Sort' },
    { cell_type: 'code', source: 'lista = [3, 1, 2]', outputs: [] },
  ],
  nbformat: 4,
});

test("a student's first prediction in a lab shows on My progress", async ({ browser, isMobile }) => {
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group, lab, labPath } = await courseWithLab(staff, 'Understanding e2e', { open: true });
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Renditja',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  await apiCall(staff, 'PUT', `${labPath}/notebooks/${nb.id}/embeds`, {
    embeds: [{ cell: 1, viz: 'renditja', title: 'Selection Sort', props: { algo: 'selection', values: [3, 1, 2] } }],
  });
  await staff.context().close();

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(`/o/e2e/courses/${course.id}/labs/${lab.id}`);
  const viz = student.locator('[data-viz-id="renditja"]');
  await viz.scrollIntoViewIfNeeded();
  const predict = viz.getByTestId('predict');
  await predict.getByText('Parashiko', { exact: true }).click();
  await viz.getByRole('button', { name: 'Hapi tjetër (→)' }).click();
  const question = predict.getByRole('group', { name: /Cili element do të përfundojë në pozicionin 0/ });
  const sent = student.waitForResponse((res) => res.url().includes('/embeds/1/results') && res.status() === 204);
  await question.getByRole('button', { name: '1', exact: true }).click();
  await sent;

  await student.goto(`/o/e2e/courses/${course.id}/progress`);
  const understanding = student.getByTestId('understanding');
  await expect(understanding).toContainText('Selection Sort');
  await expect(understanding).toContainText('1 nga 1 të sakta në provën e parë');
  await student.context().close();
});

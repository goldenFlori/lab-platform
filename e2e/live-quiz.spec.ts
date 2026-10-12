import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #87: the pedagog takes a question the copilot drafted, a student answers on their phone, the
// pedagog sees the count and reveals the answer. (The model is the fake one: src/api/ai/provider.ts.)

const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '## Insertion Sort\n\nÇdo element futet në vendin e tij midis atyre para tij.' },
    { cell_type: 'code', source: 'print(sorted([3, 1, 2]))', outputs: [] },
  ],
  nbformat: 4,
});

test('a pedagog asks a drafted question in a Live Lab and a student answers it', async ({ browser, isMobile }) => {
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group, labPath, pageUrl } = await courseWithLab(staff, 'Quiz e2e', { open: true });
  await apiCall(staff, 'PATCH', `/orgs/e2e/courses/${course.id}`, { ai: true });
  await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Renditja',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  await apiCall(staff, 'POST', `${labPath}/live`);
  await staff.goto(pageUrl);
  await staff.getByRole('button', { name: 'Pyetje e shpejtë' }).click();
  const composer = staff.getByTestId('quiz-composer');
  await composer.getByRole('button', { name: 'Sugjero 3 pyetje me AI' }).click();
  await composer.getByRole('button', { name: /Cila strukturë përdoret nga BFS/ }).click();
  await expect(composer.getByLabel('Pyetja')).toHaveValue('Cila strukturë përdoret nga BFS?');

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(`${pageUrl}?live=1`);
  await expect(student.getByTestId('live-student')).toBeVisible();

  await composer.getByRole('button', { name: 'Nis pyetjen' }).click();
  const card = student.getByTestId('quiz-student');
  await card.getByRole('button', { name: 'A) Radha' }).click();
  await expect(card).toContainText('Përgjigjja juaj u dërgua.');

  const results = staff.getByTestId('quiz-results');
  await expect(results.getByTestId('quiz-count-0')).toHaveText('1');
  await results.getByRole('button', { name: 'Shfaq përgjigjen' }).click();
  await expect(card).toContainText('E saktë!');
  await student.context().close();
  await staff.context().close();
});

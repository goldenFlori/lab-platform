import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #86 is done when a student gets an explanation of their error and the pedagog reads the question
// in the course. (The model is the fake one: src/api/ai/provider.ts.)

const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '# Gabime' },
    { cell_type: 'code', source: 'totali = 0\nprint(total)', outputs: [] },
  ],
  nbformat: 4,
});

test('a student asks to explain an error and the pedagog reads it in the course', async ({ browser, isMobile }) => {
  test.setTimeout(180_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group, labPath, pageUrl } = await courseWithLab(staff, 'Explain e2e', { open: true });
  await apiCall(staff, 'PATCH', `/orgs/e2e/courses/${course.id}`, { ai: true });
  await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Gabime',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(pageUrl);
  await student.getByRole('button', { name: 'Ekzekuto qelizën 1' }).click();
  const explain = student.getByTestId('explain');
  await explain.getByRole('button', { name: 'Shpjego gabimin' }).click({ timeout: 90_000 });
  await expect(explain.getByTestId('explain-answer')).toContainText('Përgjigje prove');
  await expect(explain).toContainText("Stafi i kursit mund t'i lexojë pyetjet tuaja.");
  await student.context().close();

  await staff.goto(`/o/e2e/courses/${course.id}`);
  const questions = staff.getByTestId('ai-questions');
  await questions.getByText('Pyetjet e studentëve për gabimet (1)').click();
  await expect(questions).toContainText(E2E_ACCOUNT.fullName);
  await expect(questions).toContainText("NameError: name 'total' is not defined");
  await staff.context().close();
});

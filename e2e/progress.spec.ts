import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #99: a student with a solved exercise, a submission and a released grade sees them on "My progress".

const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '## Ushtrimi 1 — Shuma' },
    { cell_type: 'code', source: 'def shuma(a, b):\n    raise NotImplementedError', outputs: [] },
  ],
  nbformat: 4,
});

test('a student sees their solved exercise, submission and grade on My progress', async ({ browser, isMobile }) => {
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group, labPath } = await courseWithLab(staff, 'Progress e2e', { open: true });
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Ushtrime',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  const nbPath = `${labPath}/notebooks/${nb.id}`;
  await apiCall(staff, 'PUT', `${nbPath}/exercises`, {
    exercises: [{ cell: 1, title: 'Ushtrimi 1 — Shuma', test: 'assert shuma(1, 2) == 3' }],
  });
  await apiCall(staff, 'PUT', `${nbPath}/assignments/${group.id}`, {
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
  });

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await apiCall(student, 'GET', nbPath);
  await apiCall(student, 'POST', `${nbPath}/exercises/1/done`);
  await apiCall(student, 'POST', `${nbPath}/submission`);
  const me = await apiCall<{ user: { id: string } }>(student, 'GET', '/me');
  await apiCall(staff, 'PUT', `${nbPath}/grades/${me.user.id}`, {
    autoScore: 1,
    maxScore: 1,
    results: [{ cell: 1, status: 'pass' }],
  });
  await apiCall(staff, 'POST', `${nbPath}/grades/release?group=${group.id}`);

  await student.goto(`/o/e2e/courses/${course.id}`);
  // #126: the course page shows the student's path; this lab is graded, so nothing is left to do.
  const path = student.getByTestId('learning-path');
  await expect(path).toContainText('1 nga 1 laboratorë të filluar · 1/1 ushtrime');
  await expect(path.getByRole('link', { name: /Laboratori 1: .* — Me notë, 1 nga 1 ushtrime/ })).toHaveAttribute(
    'data-state',
    'graded',
  );
  await expect(student.getByTestId('learning-path-next')).toHaveCount(0);
  await student.getByRole('link', { name: 'Progresi im' }).click();
  await expect(student.getByRole('heading', { name: 'Progresi im', level: 1 })).toBeVisible();
  const totals = student.getByTestId('progress-totals');
  await expect(totals).toContainText('Laboratorë të hapur1/1');
  await expect(totals).toContainText('Ushtrime të zgjidhura1/1');
  await expect(totals).toContainText('Dorëzime1/1');
  await expect(student.getByTestId('progress-lab')).toContainText('Dorëzuar më');
  await expect(student.getByTestId('progress-grade')).toHaveText('Nota: 1/1');
  await student.context().close();
  // Staff see the course's management, not a path of their own.
  await staff.goto(`/o/e2e/courses/${course.id}`);
  await expect(staff.getByRole('heading', { name: 'Grupet' })).toBeVisible();
  await expect(staff.getByTestId('learning-path')).toHaveCount(0);
  await staff.context().close();
});

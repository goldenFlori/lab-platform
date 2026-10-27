import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import type { StaffGrade } from '../src/shared/grading';
import { PLAIN_WORDS, traceOf } from '../src/shared/trace';
import { variantProblem, variantSeed } from '../src/shared/trace-problem';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #168: a graded trace table is filled unchecked, saved, handed in, and scored by the server.

const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '## Kolokium' },
    { cell_type: 'markdown', source: 'Gjurmoni Prim-in mbi grafin tuaj.' },
  ],
  nbformat: 4,
});
const VARIANT = { algorithm: 'prim', nodes: 4, directed: false } as const;

test('a student fills a graded trace table, hands it in, and the server grades it', async ({ browser, isMobile }) => {
  test.setTimeout(120_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group, lab, labPath, pageUrl } = await courseWithLab(staff, 'Trace grading e2e', { open: true });
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Kolokium',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  const nbPath = `${labPath}/notebooks/${nb.id}`;
  await apiCall(staff, 'PUT', `${nbPath}/embeds`, {
    embeds: [{ cell: 1, viz: 'tabela-gjurmimit', props: { variant: VARIANT, points: 9 } }],
  });
  await apiCall(staff, 'PUT', `${nbPath}/assignments/${group.id}`, {
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
  });

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  const me = await apiCall<{ user: { id: string } }>(student, 'GET', '/me');
  const expected = traceOf(variantProblem(VARIANT, variantSeed(me.user.id, nb.id, 1)), PLAIN_WORDS).rows;

  await student.goto(`/o/e2e/courses/${course.id}/labs/${lab.id}?notebook=${nb.id}`);
  const graded = student.getByTestId('trace-graded');
  await expect(graded).toContainText('Kjo tabelë vlerësohet: 9 pikë.');
  // Every row at once and no checking: fill all but the last total right.
  // Last row first, so the last cell typed is a right one: it counts only if the hand-in saved it.
  for (const [i, row] of [...expected.entries()].reverse()) {
    const last = i === expected.length - 1;
    await graded.getByLabel(`Hapi ${i + 1} · Brinja`).fill(row.cells.edge ?? '');
    await graded.getByLabel(`Hapi ${i + 1} · Pesha deri tani`).fill(last ? '999' : (row.cells.total ?? ''));
  }
  await expect(student.getByRole('button', { name: 'Kontrollo rreshtin' })).toHaveCount(0);
  // Handed in at once, before the rows' save would come on its own: the hand-in saves them first (#177).
  const bar = student.getByTestId('submission');
  await bar.getByRole('button', { name: 'Dorëzo punën' }).click();
  await student.getByRole('alertdialog').getByRole('button', { name: 'Dorëzo punën' }).click();
  await expect(bar).toContainText('Puna u dorëzua.');
  await student.context().close();

  const grade = await apiCall<StaffGrade>(staff, 'PUT', `${nbPath}/grades/${me.user.id}`, {
    autoScore: 0,
    maxScore: 0,
    results: [],
  });
  expect(grade.traces).toEqual([{ cell: 1, rows: 3, right: 2, points: 9, score: 6 }]);
  // Staff practise on it, with a note that it is graded.
  await staff.goto(`${pageUrl}?notebook=${nb.id}`);
  await expect(staff.locator('article [data-viz-id="tabela-gjurmimit"]')).toContainText('Tabelë me notë: 9 pikë.');
  await staff.context().close();
});

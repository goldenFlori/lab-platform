import { expect, type Page, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #67: in a session, students run a challenge and the pedagog's board shows the counts and the most
// common error as they change.

const code = (source: string) => ({ cell_type: 'code', source, outputs: [] });
const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '## Ushtrimi 1 — Shuma' },
    code('def shuma(a, b):\n    raise NotImplementedError'),
    code('def _testet():\n    assert shuma(1, 2) == 3\n\nkontrollo("Ushtrimi 1 — Shuma", _testet)'),
  ],
  nbformat: 4,
});
const run = (page: Page, n: number) => page.getByRole('button', { name: `Ekzekuto qelizën ${n}` }).click();

test("students run a live challenge and the pedagog's board follows", async ({ browser, isMobile }) => {
  test.setTimeout(150_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { group, labPath, pageUrl } = await courseWithLab(staff, 'Challenge e2e', { open: true });
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Sfida',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  await apiCall(staff, 'POST', `${labPath}/live`);
  await staff.goto(pageUrl);
  await staff.getByRole('button', { name: 'Fillo sfidën' }).click();
  const board = staff.getByTestId('live-board');
  await expect(board).toContainText('Sfidë: Ushtrimi 1 — Shuma');

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await apiCall(student, 'PUT', `${labPath}/notebooks/${nb.id}/edits/1`, {
    code: 'def shuma(a, b):\n    return a + b',
  });
  await student.goto(`${pageUrl}?live=1`);
  await expect(student.getByTestId('live-challenge')).toContainText('Sfidë: Ushtrimi 1 — Shuma');

  // The check before the function is defined: a failure, and its error type on the board.
  await run(student, 2);
  await expect(board.getByTestId('board-failed')).toHaveText('1', { timeout: 90_000 });
  await expect(board.getByTestId('board-error')).toContainText('NameError (1)');

  // Then solved: the student's latest result counts.
  await run(student, 1);
  await run(student, 2);
  await expect(board.getByTestId('board-passed')).toHaveText('1');
  await expect(board.getByTestId('board-failed')).toHaveText('0');
  await board.getByRole('button', { name: 'Shfaq emrat' }).click();
  await expect(board).toContainText(E2E_ACCOUNT.fullName);

  await board.getByRole('button', { name: 'Ndalo sfidën' }).click();
  await expect(student.getByTestId('live-challenge')).toHaveCount(0);
  await student.context().close();
  await staff.context().close();
});

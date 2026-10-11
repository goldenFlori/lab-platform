import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #70 is done when a student's BFS on a course graph animates next to the reference BFS.

const BFS = [
  'import vizlab',
  'from collections import deque',
  '',
  "G = vizlab.graph({'A': ['B', 'C'], 'B': ['D'], 'C': ['D'], 'D': []})",
  "vizituar = {'A'}",
  "radha = deque(['A'])",
  'while radha:',
  '    u = radha.popleft()',
  '    vizlab.visit(u)',
  '    for v in G[u]:',
  '        if v not in vizituar:',
  '            vizituar.add(v)',
  '            vizlab.mark((u, v))',
  '            radha.append(v)',
].join('\n');
const NOTEBOOK = JSON.stringify({
  cells: [{ cell_type: 'code', source: '# Shkruani BFS-në tuaj këtu', outputs: [] }],
  nbformat: 4,
});

test("a student's BFS animates next to the reference BFS", async ({ browser, isMobile }) => {
  test.setTimeout(120_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { group, labPath, pageUrl } = await courseWithLab(staff, 'Vizlab graph e2e', { open: true });
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'BFS ime',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  await staff.context().close();

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await apiCall(student, 'PUT', `${labPath}/notebooks/${nb.id}/edits/0`, { code: BFS });
  await student.goto(pageUrl);
  // The student's own code has loaded into the cell.
  await expect(student.getByRole('textbox', { name: 'Kodi i qelizës 1' })).toContainText('vizlab');
  await student.getByRole('button', { name: 'Ekzekuto qelizën 1' }).click();

  const viz = student.getByTestId('vizlab');
  await expect(viz.getByText('Kodi juaj në graf', { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(viz).toContainText('Referenca: BFS');
  await viz.locator('[data-viz]').focus();
  await student.keyboard.press('End');
  await expect(viz).toContainText('Rendi i vizitës: A → B → C → D.');
  await expect(
    viz.getByTestId('vizlab-graph-mine').getByRole('img', { name: /Graf me 4 kulme dhe 4 brinjë/ }),
  ).toBeVisible();
  await student.context().close();
});

import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #69 is done when a student instruments their insertion sort with vizlab and watches it animate
// next to the reference.

const SORT = [
  'import vizlab',
  '',
  'A = vizlab.track([6, 4, 3, 8, 5])',
  'for i in range(1, len(A)):',
  '    aktual = A[i]',
  '    j = i - 1',
  '    while j >= 0 and vizlab.compare(j, j + 1) and A[j] > aktual:',
  '        A[j + 1] = A[j]',
  '        j -= 1',
  '    A[j + 1] = aktual',
].join('\n');
const NOTEBOOK = JSON.stringify({
  cells: [{ cell_type: 'code', source: '# Shkruani renditjen tuaj këtu', outputs: [] }],
  nbformat: 4,
});

test('a student sees their own insertion sort animate next to the reference', async ({ browser, isMobile }) => {
  test.setTimeout(120_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { group, labPath, pageUrl } = await courseWithLab(staff, 'Vizlab e2e', { open: true });
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Renditja ime',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  await staff.context().close();

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await apiCall(student, 'PUT', `${labPath}/notebooks/${nb.id}/edits/0`, { code: SORT });
  await student.goto(pageUrl);
  // At once: ▶ waits until the student's saved code has loaded, so their code runs (#78).
  await student.getByRole('button', { name: 'Ekzekuto qelizën 1' }).click();

  const viz = student.getByTestId('vizlab');
  await expect(viz.getByText('Kodi juaj, i vizualizuar', { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(viz).toContainText('Referenca: Insertion Sort');
  await expect(viz).toContainText('Lista juaj në fillim: [6, 4, 3, 8, 5].');
  // To the last step: the list ended sorted.
  await viz.locator('[data-viz]').focus();
  await student.keyboard.press('End');
  await expect(viz).toContainText('Mbaroi: lista juaj është e renditur ✓');
  await expect(viz.getByTestId('vizlab-mine')).toContainText('3');
  await student.context().close();
});

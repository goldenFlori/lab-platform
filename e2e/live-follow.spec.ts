import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #66: the pedagog moves through a lab in presentation mode and a joined student's page follows,
// detaches and rejoins.

const NOTEBOOK = JSON.stringify({
  cells: Array.from({ length: 30 }, (_, i) => ({
    cell_type: 'markdown',
    source: `## Pjesa ${i + 1}\n\n${'Një paragraf i gjatë për të mbushur faqen. '.repeat(12)}`,
  })),
  nbformat: 4,
});

test("a joined student's page follows the presenter, detaches and rejoins", async ({ browser, isMobile }) => {
  test.setTimeout(90_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { group, labPath, pageUrl } = await courseWithLab(staff, 'Follow e2e', { open: true });
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Pjesët',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  await apiCall(staff, 'POST', `${labPath}/live`);

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(`${pageUrl}?live=1`);
  await expect(student.getByTestId('live-student')).toContainText('ndiqni pedagogun');

  // The pedagog presents step 20; the student's page goes there.
  await staff.goto(`${pageUrl}/present?notebook=${nb.id}&step=19`);
  await expect(staff.getByTestId('presenter-live')).toContainText('1');
  const part = (n: number) => student.getByRole('heading', { name: `Pjesa ${n}`, exact: true });
  await expect(part(20)).toBeInViewport();

  // Working alone, the page stays; following again, it goes to where the pedagog is now.
  await student.getByRole('button', { name: 'Puno vetë' }).click();
  await staff.keyboard.press('End');
  await expect(staff.getByTestId('presentation-step')).toHaveText('30 / 30');
  await student.waitForTimeout(1000);
  await expect(part(30)).not.toBeInViewport();
  await student.getByRole('button', { name: 'Ndiq pedagogun' }).click();
  await expect(part(30)).toBeInViewport();

  await student.context().close();
  await staff.context().close();
});

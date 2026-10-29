import { expect, test } from '@playwright/test';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #191: before the first class a device downloads Python and the course's libraries once, from a page
// anyone can open, and says it is ready; a student is reminded until then; staff share it.

test('a device gets ready before the first class; the course page reminds and shares it', async ({
  browser,
  isMobile,
}) => {
  test.setTimeout(300_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group } = await courseWithLab(staff, 'Ready e2e', { open: true });
  const coursePage = `/o/e2e/courses/${course.id}`;

  // Staff share the page: a link and a QR code for the projector.
  await staff.goto(coursePage);
  const card = staff.getByRole('region', { name: 'Para orës së parë' });
  await expect(card).toContainText('/ready');
  await card.getByRole('button', { name: 'Shfaq kodin QR' }).click();
  await expect(card.getByRole('img', { name: 'Kodi QR i faqes së përgatitjes' })).toBeVisible();
  await staff.context().close();

  // A student is reminded on the course page until this device is ready.
  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(coursePage);
  await student.getByTestId('get-ready-prompt').click();
  await expect(student).toHaveURL('/ready');

  await student.getByRole('button', { name: 'Përgatit pajisjen' }).click();
  await expect(student.getByTestId('ready-message')).toContainText('Gati!', { timeout: 240_000 });
  await expect(student.getByTestId('ready-steps').locator('li[data-state="done"]')).toHaveCount(7);
  const overflow = await student.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await student.goto(coursePage);
  await expect(student.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(student.getByTestId('get-ready-prompt')).toHaveCount(0);
  await student.context().close();
});

test('a browser that cannot run Python here is told what to do', async ({ browser }) => {
  const page = await browser.newPage();
  await page.addInitScript(() => Object.defineProperty(window, 'crossOriginIsolated', { value: false }));
  await page.goto('/ready');
  await page.getByRole('button', { name: 'Përgatit pajisjen' }).click();
  await expect(page.getByTestId('ready-message')).toContainText('Përdorni versionin e fundit');
  await expect(page.getByTestId('ready-steps').locator('li[data-state="failed"]')).toHaveCount(1);
  await page.close();
});

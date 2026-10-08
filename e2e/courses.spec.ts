import { type Browser, expect, type Page, test } from '@playwright/test';
import { E2E_ACCOUNT, E2E_STAFF } from './account';

test.beforeEach(({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

async function signedIn(browser: Browser, account: { username: string; password: string }, isMobile: boolean) {
  const context = await browser.newContext(isMobile ? { viewport: { width: 375, height: 812 }, isMobile: true } : {});
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/login');
  await page.getByLabel('Emri i përdoruesit').fill(account.username);
  await page.getByLabel('Fjalëkalimi', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Hyr', exact: true }).click();
  await expect(page).toHaveURL('/courses');
  return page;
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('a pedagog opens a course and a group; a student joins with the code and sees the course', async ({
  browser,
  isMobile,
}) => {
  const title = `SDA e2e ${crypto.randomUUID().slice(0, 6)}`;

  // The pedagog creates the course and a group, and gets its code.
  const staff = await signedIn(browser, E2E_STAFF, isMobile);
  await staff.getByRole('button', { name: 'Kurs i ri' }).click();
  await staff.getByLabel('Titulli').fill(title);
  await staff.getByRole('button', { name: 'Krijo kursin' }).click();
  await expect(staff.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(staff).toHaveTitle(`${title} · Lab Platform`);

  await staff.getByPlaceholder('Emri i grupit, p.sh. Grupi B').fill('Grupi A');
  await staff.getByRole('button', { name: 'Shto grupin' }).click();
  const code = (await staff.getByTestId('join-code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await noHorizontalOverflow(staff);

  // Shown on the projector: the QR code and the code in large letters.
  await staff.getByRole('button', { name: 'Shfaq në ekran' }).click();
  const projector = staff.getByRole('dialog', { name: 'Kodi i regjistrimit për Grupi A' });
  await expect(projector.getByRole('img', { name: /Kodi QR/ })).toBeVisible();
  await expect(projector.getByText(code)).toBeVisible();
  await staff.keyboard.press('Escape');
  await expect(projector).toBeHidden();

  // The student, from another school, follows the QR link, joins, and lands in the course.
  const student = await signedIn(browser, E2E_ACCOUNT, isMobile);
  await student.goto(`/join?code=${code.replace('-', '')}`);
  await expect(student.getByLabel('Kodi i grupit')).toHaveValue(code.replace('-', ''));
  await student.getByRole('button', { name: 'Bashkohu', exact: true }).click();
  await expect(student.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(student.getByText('Kodi i regjistrimit')).toHaveCount(0);
  await noHorizontalOverflow(student);

  await student.getByRole('link', { name: 'Kurset e mia' }).click();
  await expect(student.getByRole('link', { name: new RegExp(title) })).toBeVisible();

  // Once the pedagog closes registration, the code stops working.
  await staff.getByRole('button', { name: 'Mbyll regjistrimin' }).click();
  await expect(staff.getByText('Regjistrimi është i mbyllur.')).toBeVisible();
  await student.goto('/join');
  await student.getByLabel('Kodi i grupit').fill(code);
  await student.getByRole('button', { name: 'Bashkohu', exact: true }).click();
  await expect(student.getByRole('alert')).toContainText('Ky kod nuk funksionon');

  await staff.context().close();
  await student.context().close();
});

test('a signed-out student following the QR link signs in first and comes back to join', async ({ page }) => {
  await page.goto('/join?code=K7QM4XPA');
  await expect(page).toHaveURL('/login?redirect=%2Fjoin%3Fcode%3DK7QM4XPA');
  await page.getByLabel('Emri i përdoruesit').fill(E2E_ACCOUNT.username);
  await page.getByLabel('Fjalëkalimi', { exact: true }).fill(E2E_ACCOUNT.password);
  await page.getByRole('button', { name: 'Hyr', exact: true }).click();
  await expect(page).toHaveURL('/join?code=K7QM4XPA');
  await expect(page.getByLabel('Kodi i grupit')).toHaveValue('K7QM4XPA');
});

test('an unknown course shows the 404 page', async ({ browser, isMobile }) => {
  const page = await signedIn(browser, E2E_ACCOUNT, isMobile);
  await page.goto('/o/e2e/courses/not-a-course');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kjo rrugë nuk ekziston në graf');
  await page.context().close();
});

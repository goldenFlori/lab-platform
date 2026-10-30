import { expect, type Page, test } from '@playwright/test';
import { E2E_ACCOUNT } from './account';

test.beforeEach(({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

async function signIn(page: Page, password = E2E_ACCOUNT.password) {
  await page.getByLabel('Emri i përdoruesit').fill(E2E_ACCOUNT.username);
  await page.getByLabel('Fjalëkalimi', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Hyr', exact: true }).click();
}

test('signs in, opens my courses, and signs out', async ({ page }) => {
  await page.goto('/courses');
  await expect(page).toHaveURL('/login?redirect=%2Fcourses');

  await signIn(page);
  await expect(page).toHaveURL('/courses');
  await expect(page.getByRole('heading', { level: 1, name: 'Kurset e mia' })).toBeVisible();
  const account = page.getByRole('button', { name: E2E_ACCOUNT.fullName });
  await expect(account).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // Still signed in after a reload: the session lives in the cookie.
  await page.reload();
  await expect(account).toBeVisible();

  await account.click();
  await page.getByRole('menuitem', { name: 'Dil' }).click();
  await expect(page).toHaveURL('/');
  // The header's link; the front page has another for visitors (#103).
  await expect(page.getByRole('banner').getByRole('link', { name: 'Hyr', exact: true })).toBeVisible();

  await page.goto('/courses');
  await expect(page).toHaveURL('/login?redirect=%2Fcourses');
});

test('explains a wrong password in Albanian', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, 'not-the-password');
  await expect(page.getByRole('alert')).toHaveText('Emri i përdoruesit ose fjalëkalimi nuk është i saktë.');
  await expect(page).toHaveURL('/login');
});

test('asks for both fields before sending anything', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Hyr', exact: true }).click();
  await expect(page.getByText('Shkruani emrin e përdoruesit.')).toBeVisible();
  await expect(page.getByText('Shkruani fjalëkalimin.')).toBeVisible();
});

test('can show the password while typing it', async ({ page }) => {
  await page.goto('/login');
  const password = page.getByLabel('Fjalëkalimi', { exact: true });
  await password.fill('sekret');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Shfaq fjalëkalimin' }).click();
  await expect(password).toHaveAttribute('type', 'text');
});

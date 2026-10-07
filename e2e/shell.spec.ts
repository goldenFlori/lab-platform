import { expect, test } from '@playwright/test';

// Any uncaught error in the page fails the test.
test.beforeEach(({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

test('the home page shows the shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Lab Platform');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('në lëvizje');
  await expect(page.getByRole('link', { name: 'Kreu' })).toBeVisible();
});

test('the labs link asks a signed-out visitor to sign in, without a full reload', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.evaluate(() => {
    (window as unknown as { loadedOnce: boolean }).loadedOnce = true;
  });

  if (isMobile) {
    await page.getByRole('button', { name: 'Menyja' }).click();
    await page.getByRole('menuitem', { name: 'Laboratorët' }).click();
  } else {
    await page.getByRole('navigation', { name: 'Navigimi kryesor' }).getByRole('link', { name: 'Laboratorët' }).click();
  }

  await expect(page).toHaveURL('/login?redirect=%2Flabs');
  await expect(page.getByRole('heading', { level: 1, name: 'Hyr në llogari' })).toBeVisible();
  await expect(page).toHaveTitle('Hyr · Lab Platform');
  expect(await page.evaluate(() => (window as unknown as { loadedOnce?: boolean }).loadedOnce)).toBe(true);
});

test('unknown paths show the 404 page with a way home', async ({ page }) => {
  await page.goto('/does-not-exist');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kjo rrugë nuk ekziston në graf');
  await page.getByRole('link', { name: 'Kthehu në kreu' }).click();
  await expect(page).toHaveURL('/');
});

test('the theme follows the system by default', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the theme toggle switches the theme and remembers it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: 'Kalo në temën e errët' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).toHaveClass('dark');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

for (const path of ['/', '/login', '/does-not-exist']) {
  test(`no horizontal overflow on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

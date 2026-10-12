import { expect, test } from '@playwright/test';

// #103: the signed-out front page says what the platform does, plays a real visualization, and
// works in both languages without horizontal scroll on a phone.

test('the front page explains the platform, in both languages, and fits a phone', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Shihni algoritmin');
  await expect(page.getByRole('link', { name: 'Hyr' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Shikojeni në punë' }).click();
  await expect(page.getByRole('heading', { name: 'Provojeni këtu' })).toBeInViewport();
  // A real visualization, not a picture of one.
  await expect(page.locator('[data-viz-id="labirinti"] [aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByRole('region', { name: 'Çfarë bën' }).getByRole('heading', { level: 3 })).toHaveCount(6);
  await expect(page.getByText('Falas për një kurs.')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole('button', { name: /English/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('See the algorithm');
  await expect(page.getByRole('heading', { name: 'What it does' })).toBeVisible();
});

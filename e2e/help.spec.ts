import { expect, test } from '@playwright/test';
import { E2E_STAFF } from './account';
import { courseWithLab } from './notebooks';
import { signIn } from './sign-in';

// #194: guides for students and pedagogs, open to anyone, with pictures of the real pages, and reached
// from the screens they explain.

test('the guides are listed by audience and show their steps with pictures', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Ndihmë' }).click();
  await expect(page.getByRole('heading', { name: 'Ndihmë', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Për studentët' }).getByRole('link')).toHaveCount(6);
  await expect(page.getByRole('region', { name: 'Për pedagogët dhe asistentët' }).getByRole('link')).toHaveCount(7);

  await page.getByRole('link', { name: /Dorëzimi dhe kolokiumi/ }).click();
  await expect(page.getByRole('heading', { name: 'Dorëzimi dhe kolokiumi', level: 1 })).toBeVisible();
  await expect(page.getByTestId('guide-steps').getByRole('strong').first()).toBeVisible();
  const picture = page.getByRole('img', { name: 'Pamje e hapit 1' });
  await picture.scrollIntoViewIfNeeded();
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a screen links to its guide', async ({ browser, isMobile }) => {
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { pageUrl } = await courseWithLab(staff, 'Help e2e', { open: true });
  await staff.goto(pageUrl);
  await staff.getByTestId('lab-toolbar').getByRole('link', { name: 'Ndihmë' }).click();
  await expect(staff).toHaveURL('/help/labs');
  await expect(staff.getByRole('heading', { name: 'Laboratorët dhe fletoret', level: 1 })).toBeVisible();
  await staff.context().close();
});

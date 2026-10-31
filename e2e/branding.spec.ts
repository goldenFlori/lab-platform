import { expect, test } from '@playwright/test';
import { hashPassword } from '../src/shared/password';
import { E2E_STAFF } from './account';
import { apiCall, signIn } from './sign-in';

// #201: an institution's admin gives it a name, a readable colour and a logo; its members see them on
// its pages, and so does whoever arrives from one of its join links. A fresh institution, made through
// the owner's console, so no other test sees its colours.

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test('an institution looks like itself to its members and on its join links', async ({ browser, isMobile }) => {
  test.setTimeout(120_000);
  const suffix = crypto
    .randomUUID()
    .slice(0, 6)
    .replace(/[^a-z]/g, 'x');
  const slug = `brand-${suffix}`;
  const admin = { username: `admin.brand${suffix}`, password: `Brand-${suffix}-2026` };
  const owner = await signIn(browser, E2E_STAFF, isMobile);
  await apiCall(owner, 'POST', '/platform/institutions', {
    name: `Brand ${suffix}`,
    slug,
    admin: { fullName: 'Admin Brand', username: admin.username, passwordHash: await hashPassword(admin.password) },
  });
  await owner.context().close();

  const page = await signIn(browser, admin, isMobile);
  const course = await apiCall<{ id: string }>(page, 'POST', `/orgs/${slug}/courses`, {
    title: 'Algoritmet',
    academicYear: '2026/27',
  });
  const group = await apiCall<{ joinCode: string }>(page, 'POST', `/orgs/${slug}/courses/${course.id}/groups`, {
    name: 'Grupi A',
  });

  await page.goto('/courses');
  await page.getByRole('link', { name: 'Institucioni' }).click();
  await page.getByLabel('Emri i institucionit').fill('Fakulteti i Markës');
  // Yellow under white text cannot be read: refused before saving.
  await page.getByLabel('Ngjyra', { exact: true }).fill('#ffcc00');
  await expect(page.getByTestId('accent-verdict')).toContainText('Lexohet keq');
  await expect(page.getByRole('button', { name: 'Ruaj', exact: true })).toBeDisabled();
  await page.getByLabel('Ngjyra', { exact: true }).fill('#7a1f3d');
  await expect(page.getByTestId('accent-verdict')).toContainText('Lexohet mirë');
  await page.getByRole('button', { name: 'Ruaj', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('U ruajt.');
  await page.locator('input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('main').getByRole('img', { name: 'Logoja e Fakulteti i Markës' })).toBeVisible();

  // Its pages carry its look: the header (from tablet width) and the accent.
  await page.goto(`/o/${slug}/courses/${course.id}`);
  if (!isMobile) await expect(page.getByTestId('org-brand')).toContainText('Fakulteti i Markës');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()))
    .toBe('#7a1f3d');
  await page.goto('/courses');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()))
    .not.toBe('#7a1f3d');
  await page.context().close();

  // Whoever follows one of its join links sees whose it is before signing in.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/join?code=${group.joinCode}`);
  await expect(visitor).toHaveURL(/\/login/);
  await expect(visitor.getByTestId('join-brand')).toContainText('Fakulteti i Markës');
  await expect(visitor.getByRole('img', { name: 'Logoja e Fakulteti i Markës' })).toBeVisible();
  await visitor.close();
});

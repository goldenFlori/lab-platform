import { expect, test } from '@playwright/test';
import { hashPassword } from '../src/shared/password';
import { E2E_STAFF } from './account';
import { apiCall, signIn } from './sign-in';

// #202: an institution's admin adds a pedagog with a slip, changes roles but never their own, and sets
// the institution's language and AI policy, which its pages and courses then follow. A fresh
// institution, made through the owner's console, so no other test feels its settings.

test("an institution's admin runs its people and settings", async ({ browser, isMobile }) => {
  test.setTimeout(150_000);
  const suffix = crypto
    .randomUUID()
    .slice(0, 6)
    .replace(/[^a-z]/g, 'x');
  const slug = `admin-${suffix}`;
  const admin = { username: `admin.inst${suffix}`, password: `Inst-${suffix}-2026` };
  const owner = await signIn(browser, E2E_STAFF, isMobile);
  await apiCall(owner, 'POST', '/platform/institutions', {
    name: `Institucioni ${suffix}`,
    slug,
    admin: { fullName: 'Admin Inst', username: admin.username, passwordHash: await hashPassword(admin.password) },
  });
  await owner.context().close();

  const page = await signIn(browser, admin, isMobile);
  await page.goto(`/o/${slug}/admin`);
  const people = page.getByRole('region', { name: 'Njerëzit' });
  // Their own role cannot be changed.
  await expect(page.getByLabel('Roli i Admin Inst në institucion')).toBeDisabled();

  // A pedagog with a slip; the username is suggested from the name.
  await people.getByLabel('Emri i plotë').fill(`Teuta Leka${suffix}`);
  await expect(people.getByLabel('Emri i përdoruesit')).toHaveValue(`teuta.leka${suffix}`);
  await people.getByRole('button', { name: 'Krijo llogarinë' }).click();
  await expect(people.getByRole('status')).toContainText('u krijua');
  const password = (await people.getByTestId('slip-password').first().textContent())?.trim() ?? '';
  await expect(page.getByTestId('org-people')).toContainText(`teuta.leka${suffix}`);
  await page.getByLabel(`Roli i Teuta Leka${suffix} në institucion`).selectOption('coordinator');
  await expect(page.getByLabel(`Roli i Teuta Leka${suffix} në institucion`)).toHaveValue('coordinator');

  // English for whoever chose no language, and no AI in its courses.
  await page.getByLabel('Gjuha e institucionit').selectOption('en');
  await page.getByText('Lejo AI në kurset e institucionit').click();
  await page.getByRole('button', { name: 'Ruaj cilësimet' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'U ruajt.' })).toBeVisible();
  await page.context().close();

  // The coordinator signs in with the slip, creates a course, and meets the settings there.
  const coordinator = await signIn(browser, { username: `teuta.leka${suffix}`, password }, isMobile);
  const course = await apiCall<{ id: string }>(coordinator, 'POST', `/orgs/${slug}/courses`, {
    title: 'Grafet',
    academicYear: '2026/27',
  });
  await coordinator.goto(`/o/${slug}/courses/${course.id}`);
  await expect(coordinator.getByText('The institution does not allow AI in its courses.')).toBeVisible();
  await expect(coordinator.getByRole('switch', { name: 'Artificial intelligence' })).toBeDisabled();
  await coordinator.context().close();
});

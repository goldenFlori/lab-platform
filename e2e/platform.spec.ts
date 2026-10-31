import { expect, test } from '@playwright/test';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { signIn } from './sign-in';

// #200: the platform's owner creates an institution and its first admin in the app; the admin signs in
// with the printed slip and starts their first course; no one else finds the console.

test('the owner creates an institution whose admin signs in and starts a course', async ({ browser, isMobile }) => {
  const owner = await signIn(browser, E2E_STAFF, isMobile);
  await owner.getByRole('button', { name: new RegExp(E2E_STAFF.fullName) }).click();
  await owner.getByRole('menuitem', { name: 'Platforma' }).click();
  await expect(owner.getByRole('heading', { name: 'Institucionet', level: 1 })).toBeVisible();
  await expect(owner.getByTestId('institutions')).toContainText('/o/e2e');

  const suffix = crypto
    .randomUUID()
    .slice(0, 6)
    .replace(/[^a-z]/g, 'x');
  await owner.getByLabel('Emri i institucionit').fill(`Fakulteti i Provës ${suffix}`);
  await expect(owner.getByLabel('Adresa')).toHaveValue(`fakulteti-i-proves-${suffix}`);
  await owner.getByLabel('Emri i plotë i administratorit').fill(`Admin Prove${suffix}`);
  await expect(owner.getByLabel('Emri i përdoruesit')).toHaveValue(`admin.prove${suffix}`);
  await owner.getByRole('button', { name: 'Krijo institucionin' }).click();
  await expect(owner.getByRole('status')).toContainText('u krijua');
  await expect(owner.getByTestId('institutions')).toContainText(`/o/fakulteti-i-proves-${suffix}`);
  const slip = owner.getByTestId('slip').first();
  const password = (await slip.getByTestId('slip-password').textContent())?.trim() ?? '';
  expect(password.length).toBeGreaterThanOrEqual(12);
  await owner.context().close();

  const admin = await signIn(browser, { username: `admin.prove${suffix}`, password }, isMobile);
  await admin.goto('/courses');
  await expect(admin.getByRole('button', { name: 'Kurs i ri' })).toBeVisible();
  await admin.context().close();
});

test('the console does not exist for anyone else', async ({ browser, isMobile }) => {
  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await student.goto('/platform');
  await expect(student.getByRole('heading', { name: 'Kjo rrugë nuk ekziston në graf' })).toBeVisible();
  await student.getByRole('button', { name: new RegExp(E2E_ACCOUNT.fullName) }).click();
  await expect(student.getByRole('menuitem', { name: 'Platforma' })).toHaveCount(0);
  await student.context().close();
});

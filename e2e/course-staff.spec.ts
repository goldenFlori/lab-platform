import { expect, test } from '@playwright/test';
import { E2E_STAFF } from './account';
import { courseWithLab } from './notebooks';
import { signIn } from './sign-in';

// #64: a pedagog makes an assistant for one group in the app, and removes them again.

test('a pedagog adds a new assistant to one group and removes them', async ({ browser, isMobile }) => {
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course } = await courseWithLab(staff, 'Staff e2e');
  await staff.goto(`/o/e2e/courses/${course.id}`);
  await expect(staff.getByRole('heading', { name: 'Stafi i kursit' })).toBeVisible();

  const name = `Asistent ${crypto.randomUUID().slice(0, 4)}`;
  const add = staff.getByRole('form', { name: 'Shto në staf' });
  await add.getByLabel('Përdoruesi').fill('nuk.ekziston.kurre');
  await add.getByRole('button', { name: 'Shto' }).click();
  await expect(staff.getByText('Nuk ka llogari me këtë përdorues')).toBeVisible();

  const create = staff.getByRole('form', { name: 'Krijo llogari të re' });
  await create.getByLabel('Emri i plotë').fill(name);
  await create.getByLabel('Për').selectOption({ label: 'Grupi A' });
  await create.getByRole('button', { name: 'Krijo llogarinë' }).click();
  await expect(staff.getByText(/Llogaria u krijua\. Përdoruesi: asistent/)).toBeVisible();
  const member = staff.getByTestId('staff-member').filter({ hasText: name });
  await expect(member).toContainText('Asistent · Grupi A');

  await member.getByRole('button', { name: `Hiq ${name} nga stafi` }).click();
  await expect(member).toHaveCount(0);
  await staff.context().close();
});

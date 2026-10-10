import { type Browser, expect, test } from '@playwright/test';
import { E2E_ACCOUNT, E2E_STAFF } from './account';

async function signIn(browser: Browser, account: { username: string; password: string }, isMobile: boolean) {
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

test('a pedagog opens and hides a lab; the student sees it change at once', async ({ browser, isMobile }) => {
  test.setTimeout(60_000);
  const title = `Labs e2e ${crypto.randomUUID().slice(0, 6)}`;

  // The pedagog sets up a course with a group and one lab.
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  await staff.getByRole('button', { name: 'Kurs i ri' }).click();
  await staff.getByLabel('Titulli').fill(title);
  await staff.getByRole('button', { name: 'Krijo kursin' }).click();
  await expect(staff.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await staff.getByPlaceholder('Emri i grupit, p.sh. Grupi B').fill('Grupi A');
  await staff.getByRole('button', { name: 'Shto grupin' }).click();
  const code = ((await staff.getByTestId('join-code').textContent()) ?? '').trim();
  await staff.getByRole('button', { name: 'Shto laborator' }).click();
  await staff.getByLabel('Titulli', { exact: true }).last().fill('Grafet');
  await staff.getByRole('button', { name: 'Shto laboratorin' }).click();
  await expect(staff.getByText('E fshehur')).toBeVisible();
  const courseUrl = staff.url();
  // What a person clicks: the switch's visible label (the checkbox itself sits hidden underneath).
  const openSwitch = staff.locator('label', {
    has: staff.getByRole('switch', { name: 'Hapur për studentët: Grafet' }),
  });

  // A student joins: the lab is hidden.
  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await student.goto(`/join?code=${code}`);
  await student.getByRole('button', { name: 'Bashkohu', exact: true }).click();
  await expect(student.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(student.getByText("Laboratorët shfaqen këtu sapo pedagogu t'i hapë.")).toBeVisible();

  // Switched on: the student sees it on the next load.
  await openSwitch.click();
  await expect(staff.getByText('E hapur', { exact: true })).toBeVisible();
  await student.reload();
  await expect(student.getByRole('heading', { level: 3, name: 'Grafet' })).toBeVisible();

  // Switched off: gone again.
  await openSwitch.click();
  await expect(staff.getByText('E fshehur')).toBeVisible();
  await student.reload();
  await expect(student.getByRole('heading', { level: 3, name: 'Grafet' })).toHaveCount(0);

  // Open for the course, but hidden for Grupi A: the group's own setting wins.
  await openSwitch.click();
  await staff.getByRole('button', { name: 'Orari' }).click();
  await staff.getByRole('button', { name: 'Ndryshe për këtë grup' }).click();
  const groupRule = staff.getByRole('form', { name: 'Orari: Grupi A' });
  await groupRule.getByLabel('Gjendja').selectOption('hidden');
  await groupRule.getByRole('button', { name: 'Ruaj orarin' }).click();
  await expect(staff.getByText('Grupi A: E fshehur')).toBeVisible();
  await student.reload();
  await expect(student.getByRole('heading', { level: 3, name: 'Grafet' })).toHaveCount(0);

  // Back to the course setting, then scheduled for tomorrow: still hidden, and shown as scheduled.
  await groupRule.getByRole('button', { name: 'Si gjithë kursi' }).click();
  await expect(staff.getByText('Grupi A: E fshehur')).toHaveCount(0);
  const courseRule = staff.getByRole('form', { name: 'Orari: Të gjitha grupet' });
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  await courseRule.getByLabel('Gjendja').selectOption('scheduled');
  await courseRule
    .getByLabel('Hapet më', { exact: true })
    .fill(`${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T10:00`);
  await courseRule.getByRole('button', { name: 'Ruaj orarin' }).click();
  await expect(staff.getByText(/^Hapet \d/)).toBeVisible(); // the chip: "Hapet" and the date
  await student.reload();
  await expect(student.getByRole('heading', { level: 3, name: 'Grafet' })).toHaveCount(0);

  const overflow = await staff.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(courseUrl).toContain('/courses/');
  await staff.context().close();
  await student.context().close();
});

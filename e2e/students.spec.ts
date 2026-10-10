import { type Browser, expect, type Page, test } from '@playwright/test';
import { E2E_STAFF } from './account';

const FIRST = ['Arben', 'Mira', 'Ëndrit', 'Besa', 'Klea', 'Gentian', 'Era', 'Dritan', 'Ana', 'Luan', 'Sara', 'Erion'];
const LAST = ['Hoxha', 'Kola', 'Çela', 'Duka', 'Shehu', 'Gjoka', 'Leka', 'Basha', 'Meta', 'Dibra'];

/** A realistic class: Albanian names, some of them twice. */
function classList(count: number) {
  return Array.from({ length: count }, (_, i) => `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / 2) % LAST.length]}`);
}

async function signIn(browser: Browser, username: string, password: string, isMobile = false) {
  const context = await browser.newContext(isMobile ? { viewport: { width: 375, height: 812 }, isMobile: true } : {});
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/login');
  await page.getByLabel('Emri i përdoruesit').fill(username);
  await page.getByLabel('Fjalëkalimi', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Hyr', exact: true }).click();
  await expect(page).toHaveURL('/courses');
  return page;
}

/** A fresh course with one group, opened on the group's student page. */
async function groupPage(staff: Page) {
  const title = `Import e2e ${crypto.randomUUID().slice(0, 6)}`;
  await staff.getByRole('button', { name: 'Kurs i ri' }).click();
  await staff.getByLabel('Titulli').fill(title);
  await staff.getByRole('button', { name: 'Krijo kursin' }).click();
  await expect(staff.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await staff.getByPlaceholder('Emri i grupit, p.sh. Grupi B').fill('Grupi A');
  await staff.getByRole('button', { name: 'Shto grupin' }).click();
  await staff.getByRole('link', { name: 'Studentët' }).click();
  await expect(staff.getByRole('heading', { level: 1, name: 'Grupi A' })).toBeVisible();
  return title;
}

async function importNames(staff: Page, names: string[]) {
  await staff.getByRole('link', { name: 'Importo studentë' }).click();
  await staff.getByLabel('Lista e klasës').fill(['Emri dhe mbiemri', ...names].join('\n'));
  await staff.getByRole('button', { name: 'Vazhdo' }).click();
  await expect(staff.getByText(`${names.length} studentë. Kontrolloni emrat`)).toBeVisible();
  await staff.getByRole('button', { name: `Importo ${names.length} studentë` }).click();
  await expect(staff.getByText(`${names.length} studentë u shtuan në Grupi A.`)).toBeVisible({ timeout: 30_000 });
}

test('120 students are imported and their slips printed in one go; a slip signs a student in', async ({
  browser,
  isMobile,
}) => {
  test.skip(isMobile, 'The full class runs once, on desktop; the phone checks a short list below.');
  test.setTimeout(90_000);
  const staff = await signIn(browser, E2E_STAFF.username, E2E_STAFF.password);
  const title = await groupPage(staff);
  const names = classList(120);
  await importNames(staff, names);

  const slips = staff.getByTestId('slip');
  await expect(slips).toHaveCount(120);
  // Duplicate names get numbered usernames.
  await expect(slips.filter({ hasText: 'arben.hoxha2' })).toHaveCount(1);

  // One click prints them all: the printout holds the 120 slips and nothing of the app.
  await staff.evaluate(() => {
    window.print = () => {
      (window as unknown as { printed: number }).printed =
        ((window as unknown as { printed?: number }).printed ?? 0) + 1;
    };
  });
  await staff.getByRole('button', { name: 'Printo fletët' }).click();
  expect(await staff.evaluate(() => (window as unknown as { printed?: number }).printed)).toBe(1);
  await staff.emulateMedia({ media: 'print' });
  await expect(staff.locator('.print-only .slip-print')).toHaveCount(120);
  await expect(staff.locator('#root')).toBeHidden();
  await staff.emulateMedia({ media: 'screen' });

  // The first slip signs its student in, and the student sees the course.
  const first = slips.first();
  const username = (await first.locator('dd').first().textContent()) ?? '';
  const password = (await first.getByTestId('slip-password').textContent()) ?? '';
  const student = await signIn(browser, username, password);
  await expect(student.getByRole('link', { name: new RegExp(title) })).toBeVisible();

  await staff.context().close();
  await student.context().close();
});

test('a pedagog gives a student a new password; the new slip works and the old one does not', async ({
  browser,
  isMobile,
}) => {
  const staff = await signIn(browser, E2E_STAFF.username, E2E_STAFF.password, isMobile);
  await groupPage(staff);
  await importNames(staff, ['Mira Kola', 'Besa Duka', 'Luan Leka']);
  const firstSlip = staff.getByTestId('slip').filter({ hasText: 'Mira Kola' });
  const username = (await firstSlip.locator('dd').first().textContent()) ?? '';
  const oldPassword = (await firstSlip.getByTestId('slip-password').textContent()) ?? '';
  const overflow = await staff.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  staff.on('dialog', (dialog) => dialog.accept()); // the "leave unprinted?" warning
  await staff.getByRole('link', { name: 'Grupi A' }).click();
  await expect(staff.getByText('3 studentë')).toBeVisible();
  await staff.getByRole('button', { name: 'Fjalëkalim i ri për Mira Kola' }).click();
  await staff.getByRole('button', { name: 'Krijo fjalëkalimin' }).click();
  const newPassword = (await staff.getByTestId('slip-password').textContent()) ?? '';
  expect(newPassword).toMatch(/^[a-z2-9]{12}$/);
  expect(newPassword).not.toBe(oldPassword);

  const page = await browser.newPage();
  await page.goto('/login');
  await page.getByLabel('Emri i përdoruesit').fill(username);
  await page.getByLabel('Fjalëkalimi', { exact: true }).fill(oldPassword);
  await page.getByRole('button', { name: 'Hyr', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('Fjalëkalimi', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Hyr', exact: true }).click();
  await expect(page).toHaveURL('/courses');

  await staff.context().close();
  await page.context().close();
});

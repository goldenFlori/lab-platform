import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { DeletionRequestView } from '../src/shared/my-data';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #100: the privacy page is public; a student downloads their data and asks for its deletion, and
// the institution's admin sees and handles the request.

test('the privacy page is one click away and fits a phone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Privatësia' }).click();
  await expect(page.getByRole('heading', { name: 'Privatësia', level: 1 })).toBeVisible();
  await expect(page.getByText('juridiksionin e Bashkimit Evropian')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a student downloads their data and asks for its deletion; the admin handles it', async ({
  browser,
  isMobile,
}) => {
  // One student account, and one open request per student: the phone run would meet the desktop's.
  test.skip(isMobile, 'runs once, on desktop');
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  // Requests left open by an earlier run against the same database.
  for (const r of await apiCall<DeletionRequestView[]>(staff, 'GET', '/orgs/e2e/deletion-requests')) {
    if (!r.handledAt && r.username === E2E_ACCOUNT.username) {
      await apiCall(staff, 'POST', `/orgs/e2e/deletion-requests/${r.id}/handled`);
    }
  }
  const { group } = await courseWithLab(staff, 'Privacy e2e');
  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });

  await student.getByRole('button', { name: new RegExp(E2E_ACCOUNT.fullName) }).click();
  await student.getByRole('menuitem', { name: 'Të dhënat e mia' }).click();
  await expect(student.getByRole('heading', { name: 'Të dhënat e mia', level: 1 })).toBeVisible();
  const download = student.waitForEvent('download');
  await student.getByRole('link', { name: 'Shkarko (JSON)' }).click();
  const data = JSON.parse(await readFile((await (await download).path()) ?? '', 'utf8'));
  expect(data.account.username).toBe(E2E_ACCOUNT.username);

  const form = student.getByTestId('deletion');
  await form.getByLabel('Shënim për administratorin (jo i detyrueshëm)').fill('Testim e2e');
  await form.getByRole('button', { name: 'Dërgo kërkesën' }).click();
  await expect(form).toContainText('Kërkesa u dërgua.');
  await student.context().close();

  await staff.goto('/courses');
  const requests = staff.getByTestId('deletion-requests');
  const open = requests.getByRole('listitem').filter({ hasText: 'Testim e2e' }).filter({ hasText: 'Kërkuar më' });
  await expect(open).toContainText(E2E_ACCOUNT.fullName);
  await open.getByRole('button', { name: 'Shëno të trajtuar' }).click();
  await expect(open).toHaveCount(0);
  await expect(requests).toContainText('Trajtuar më');
  await staff.context().close();
});

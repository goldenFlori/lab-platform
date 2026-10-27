import { expect, type Page, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #178: when the free plan's daily limit is reached, a student loses nothing: the work stays on the
// device (also across a reload), the page says why once, and a pressed hand-in goes through by itself
// when the platform is back. The limit is played by answering saves as D1's limit is answered.

const code = (source: string) => ({ cell_type: 'code', source, outputs: [] });
const NOTEBOOK = JSON.stringify({ cells: [code('def shuma(a, b):\n    raise NotImplementedError')], nbformat: 4 });

const editor = (page: Page) => page.getByRole('textbox', { name: 'Kodi i qelizës 1' });
const LIMIT = {
  status: 503,
  headers: { 'Retry-After': '3600' },
  contentType: 'application/json',
  body: '{"error":"daily_limit"}',
};

test('at the daily limit work stays on the device and is handed in once the platform is back', async ({
  browser,
  isMobile,
}) => {
  test.setTimeout(120_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { group, labPath, pageUrl } = await courseWithLab(staff, 'Daily limit e2e', { open: true });
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Detyra',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  await apiCall(staff, 'PUT', `${labPath}/notebooks/${nb.id}/assignments/${group.id}`, {
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
  });

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  const me = await apiCall<{ user: { id: string } }>(student, 'GET', '/me');
  await student.goto(pageUrl);

  // The limit is reached: saves are refused.
  await student.route('**/api/**/work', (route) => route.fulfill(LIMIT));
  await student.getByRole('button', { name: 'Ndrysho kodin e qelizës 1' }).click();
  await editor(student).click();
  await student.keyboard.press('ControlOrMeta+a');
  await student.keyboard.type('def shuma(a, b): return a + b');
  await expect(student.getByTestId('service-banner')).toContainText('kufirin e përdorimit falas', { timeout: 15_000 });
  await expect(student.getByTestId('edits-saving')).toContainText('nuk u ruajtën ende');

  // A reload brings the work back from the device.
  await student.reload();
  await expect(editor(student)).toContainText('return a + b');

  // Handing in waits.
  const bar = student.getByTestId('submission');
  await bar.getByRole('button', { name: 'Dorëzo punën' }).click();
  await student.getByRole('alertdialog').getByRole('button', { name: 'Dorëzo punën' }).click();
  await expect(bar).toContainText('dorëzimi provohet sërish vetë');

  // The platform is back: the work is saved and handed in by itself, and leaves the device.
  await student.unroute('**/api/**/work');
  await student.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(bar).toContainText('Puna u dorëzua.', { timeout: 15_000 });
  await expect(student.getByTestId('service-banner')).toHaveCount(0);
  expect(await student.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('lab-work:')))).toEqual([]);
  await student.context().close();

  const handed = await apiCall<{ code: { code: string }[] }>(
    staff,
    'GET',
    `${labPath}/notebooks/${nb.id}/submissions/${me.user.id}`,
  );
  expect(handed.code.map((c) => c.code)).toEqual(['def shuma(a, b): return a + b']);
  await staff.context().close();
});

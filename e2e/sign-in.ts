import { type Browser, expect, type Page } from '@playwright/test';

/** A fresh browser session signed in as this account, failing the test on any uncaught page error. */
export async function signIn(browser: Browser, account: { username: string; password: string }, isMobile: boolean) {
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

/** An API call with the page's session, as the app makes it (changes need our Origin). */
export async function apiCall<T = unknown>(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await page.request.fetch(`/api${path}`, {
    method,
    headers: { Origin: new URL(page.url()).origin, ...headers },
    data: body,
  });
  if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${await res.text()}`);
  return (res.status() === 204 ? undefined : await res.json()) as T;
}

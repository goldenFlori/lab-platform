import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { signIn } from './sign-in';

// #89 is done when the app can be installed, and a lab's code runs after the app is reopened without
// downloading the Python engine again. Offline, pages say what needs a connection.

test.use({ serviceWorkers: 'allow' });

const NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '# Python' },
    { cell_type: 'code', source: 'print(6 * 7)', outputs: [] },
  ],
  nbformat: 4,
});

test('the app installs, keeps the Python engine, and says when it is offline', async ({ browser, isMobile }) => {
  test.setTimeout(150_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const manifest = await (await staff.request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ display: 'standalone', start_url: '/courses' });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);

  const { labPath, pageUrl } = await courseWithLab(staff, 'PWA e2e');
  await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Python',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  await staff.goto(pageUrl);
  await staff.evaluate(() => navigator.serviceWorker.ready);
  // Python starts once with the worker in charge, which keeps the engine.
  await staff.reload();
  const output = staff.locator('[data-testid="run-output"][data-cell="1"]');
  await staff.getByRole('button', { name: 'Ekzekuto qelizën 1' }).click();
  await expect(output).toContainText('42', { timeout: 90_000 });

  // Reopened: the engine comes from the app's own cache, not the network.
  const reopened = await staff.context().newPage();
  const engine = reopened.waitForResponse((r) => r.url().endsWith('/pyodide.asm.wasm'));
  await reopened.goto(pageUrl);
  await reopened.getByRole('button', { name: 'Ekzekuto qelizën 1' }).click();
  expect((await engine).fromServiceWorker()).toBe(true);
  // Still cross-origin isolated, so Stop and input() keep working.
  expect(await reopened.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(reopened.locator('[data-testid="run-output"][data-cell="1"]')).toContainText('42', { timeout: 90_000 });

  await staff.context().setOffline(true);
  await reopened.goto('/courses');
  await expect(reopened.getByRole('heading', { name: 'Nuk ka lidhje me internetin' })).toBeVisible();
  await staff.context().close();
});

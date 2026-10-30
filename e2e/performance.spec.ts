import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #193: a lab on a cheap phone in a crowded room. The CPU is slowed down four times and the network
// to 2 Mbit/s with 300 ms of latency; the notebook is Lab 4's, with its figures. Measured: when the
// notebook can be read, and when the first cell's output shows, the first time and with the cache.

const SLOW = { cpu: 4, downloadKbps: 2000, uploadKbps: 750, latencyMs: 300 };
/**
 * Budgets, in seconds. Measured 2026-10-30 on a laptop: 6.2, 1.4 and 0.8. The local server does not
 * compress (production's Brotli sends the app's 877 KB as 164 KB, about 3 s less here), and CI's
 * machines are slower: hence the margin. The cached reload took 5.3 s before #193 and would fail.
 */
const BUDGET = { readFirst: 12, readAgain: 3.5, runAgain: 5 };

async function slowDown(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW.cpu });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: SLOW.latencyMs,
    downloadThroughput: (SLOW.downloadKbps * 1000) / 8,
    uploadThroughput: (SLOW.uploadKbps * 1000) / 8,
  });
}

/** Seconds from now until `ready` resolves. */
async function seconds(ready: () => Promise<unknown>) {
  const start = Date.now();
  await ready();
  return (Date.now() - start) / 1000;
}

test('a lab is readable and runs in time on a slow phone and network', async ({ browser, isMobile }) => {
  test.skip(isMobile, 'the phone is emulated here, on the desktop project');
  test.setTimeout(300_000);
  const staff = await signIn(browser, E2E_STAFF, false);
  const { group, labPath, pageUrl } = await courseWithLab(staff, 'Speed e2e', { open: true });
  const raw = readFileSync('test/notebook/fixtures/notebooks/laborator-04.ipynb', 'utf8');
  const rendered = await renderNotebook(raw);
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Laboratori 4',
    raw,
    stored: toStored(rendered),
    assets: rendered.assets,
  });
  await staff.context().close();

  const student = await signIn(browser, E2E_ACCOUNT, false);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await slowDown(student);
  const url = `${pageUrl}?notebook=${nb.id}`;
  const heading = student.locator('.notebook h2').first();
  const run = student.getByRole('button', { name: /^Ekzekuto qelizën \d+$/ }).first();

  const readFirst = await seconds(async () => {
    await student.goto(url, { waitUntil: 'commit' });
    await heading.waitFor();
  });
  // The first run downloads Python, which the get-ready page does before class (#191): not timed.
  const n = (await run.getAttribute('aria-label'))?.match(/\d+$/)?.[0];
  await run.click();
  await student.locator(`[data-testid="run-output"][data-cell="${n}"]`).waitFor({ timeout: 240_000 });

  const readAgain = await seconds(async () => {
    await student.reload({ waitUntil: 'commit' });
    await heading.waitFor();
  });
  const runAgain = await seconds(async () => {
    await run.click();
    await student.locator(`[data-testid="run-output"][data-cell="${n}"]`).waitFor({ timeout: 120_000 });
  });

  const measured = { readFirst, readAgain, runAgain };
  console.log('slow phone and network, seconds:', JSON.stringify(measured));
  test.info().annotations.push({ type: 'seconds', description: JSON.stringify(measured) });
  for (const [key, value] of Object.entries(measured)) {
    expect
      .soft(value, `${key} (budget ${BUDGET[key as keyof typeof BUDGET]} s)`)
      .toBeLessThanOrEqual(BUDGET[key as keyof typeof BUDGET]);
  }
  await student.context().close();
});

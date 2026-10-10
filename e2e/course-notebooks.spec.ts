import { readdirSync, readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import type { Embed } from '../src/shared/notebooks';
import { E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #14 is done when every course notebook renders with its visualizations, without errors and
// without overflow on a phone. The notebooks and the site's embeds are the converter's fixtures.

const FIXTURES = 'test/notebook/fixtures';
const files = readdirSync(`${FIXTURES}/notebooks`)
  .filter((file) => file.endsWith('.ipynb'))
  .sort();
const embeds = JSON.parse(readFileSync(`${FIXTURES}/embeds.json`, 'utf8')) as Record<string, Embed[]>;

test.describe.configure({ mode: 'serial' });

let staff: Page;
let pageUrl: string;
const notebookIds = new Map<string, string>();
const errors: string[] = [];

test.beforeAll(async ({ browser }, testInfo) => {
  testInfo.setTimeout(300_000);
  staff = await signIn(browser, E2E_STAFF, Boolean(testInfo.project.use.isMobile));
  staff.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const course = await courseWithLab(staff, 'Course notebooks e2e');
  pageUrl = course.pageUrl;
  for (const file of files) {
    const raw = readFileSync(`${FIXTURES}/notebooks/${file}`, 'utf8');
    const assets = new Map<string, Uint8Array>();
    const stored = toStored(await renderNotebook(raw, { assets }));
    const nb = await uploadNotebook(staff, course.labPath, { kind: 'extra', title: file, raw, stored, assets });
    await apiCall(staff, 'PUT', `${course.labPath}/notebooks/${nb.id}/embeds`, { embeds: embeds[file] ?? [] });
    notebookIds.set(file, nb.id);
  }
});

test.afterAll(async () => {
  await staff?.context().close();
});

for (const file of files) {
  test(`${file} renders with its visualizations`, async () => {
    errors.length = 0;
    await staff.goto(`${pageUrl}?notebook=${notebookIds.get(file)}`);
    await expect(staff.locator('article .notebook')).toBeVisible();

    // Every embed is placed, and every visualization opens when it scrolls into view.
    const expected = embeds[file] ?? [];
    const placed = staff.locator('article [data-viz-id]');
    await expect(placed).toHaveCount(expected.length);
    for (const [i, embed] of expected.entries()) {
      const viz = placed.nth(i);
      await expect(viz).toHaveAttribute('data-viz-id', embed.viz);
      await viz.scrollIntoViewIfNeeded();
      await expect(viz.getByRole('region')).toBeVisible();
    }

    const overflow = () =>
      staff.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    // Text comes out slightly wider on some systems (CI's Linux among them), so the page must still
    // fit with every letter a little wider.
    await staff.addStyleTag({ content: '* { letter-spacing: 0.25px !important; }' });
    expect(await overflow()).toBeLessThanOrEqual(0);
    expect(errors.filter((text) => !text.startsWith('Failed to load resource'))).toEqual([]);
  });
}

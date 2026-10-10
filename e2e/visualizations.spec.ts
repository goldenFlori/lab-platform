import { expect, type Page, test } from '@playwright/test';
import { VISUALIZER_IDS, VISUALIZERS } from '../src/shared/visualizers';

// Any uncaught error, or an error a visualization logs, fails the test. (A signed-out visitor's
// session check answers 401, which the browser logs as a failed resource.)
test.beforeEach(({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
      throw new Error(message.text());
    }
  });
});

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('the gallery lists every visualization and is reachable from the header', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) {
    await page.getByRole('button', { name: 'Menyja' }).click();
    await page.getByRole('menuitem', { name: 'Vizualizimet' }).click();
  } else {
    await page
      .getByRole('navigation', { name: 'Navigimi kryesor' })
      .getByRole('link', { name: 'Vizualizimet' })
      .click();
  }

  await expect(page).toHaveURL('/visualizations');
  await expect(page).toHaveTitle('Vizualizimet · Lab Platform');
  await expect(page.getByRole('heading', { level: 1, name: 'Vizualizimet' })).toBeVisible();
  for (const id of VISUALIZER_IDS) {
    await expect(page.getByRole('link', { name: VISUALIZERS[id] })).toBeVisible();
  }
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  await page.getByRole('link', { name: VISUALIZERS.labirinti }).click();
  await expect(page).toHaveURL('/visualizations/labirinti');
  await expect(page).toHaveTitle(`${VISUALIZERS.labirinti} · Lab Platform`);
});

for (const id of VISUALIZER_IDS) {
  test(`${id} opens, steps and fits the screen`, async ({ page }) => {
    await page.goto(`/visualizations/${id}`);
    const viz = page.locator(`[data-viz-id="${id}"]`).getByRole('region');
    await expect(viz).toBeVisible();
    await expect(viz.getByRole('heading', { level: 3 }).first()).toBeVisible();

    // Visualizations with a player take a step forward.
    const next = viz.getByRole('button', { name: 'Hapi tjetër (→)' }).first();
    if (await next.isVisible()) {
      await next.click();
      await expect(viz.getByRole('button', { name: 'Hapi i mëparshëm (←)' }).first()).toBeEnabled();
    }

    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
}

test('the arrow keys step through an algorithm', async ({ page }) => {
  await page.goto('/visualizations/renditja');
  const viz = page.locator('[data-viz-id="renditja"]').getByRole('region');
  const previous = viz.getByRole('button', { name: 'Hapi i mëparshëm (←)' });
  await expect(previous).toBeDisabled();

  await viz.focus();
  await page.keyboard.press('ArrowRight');
  await expect(previous).toBeEnabled();
  await page.keyboard.press('Home');
  await expect(previous).toBeDisabled();
});

test('an unknown visualization shows the 404 page', async ({ page }) => {
  await page.goto('/visualizations/nuk-ekziston');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kjo rrugë nuk ekziston në graf');
});

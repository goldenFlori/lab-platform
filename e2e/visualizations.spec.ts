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
  // #125: grouped by topic, each card with its moving preview.
  for (const group of [
    'Renditja dhe kompleksiteti',
    'Grafet dhe përshkimi',
    'Rrugët më të shkurtra',
    'Rrjedhat dhe çiftëzimi',
  ]) {
    await expect(page.getByRole('heading', { level: 2, name: group })).toBeVisible();
  }
  await expect(page.getByTestId('viz-card').locator('svg[viewBox="0 0 200 110"]')).toHaveCount(VISUALIZER_IDS.length);
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

// #127: in predict mode the visualization stops at a decision and asks before showing it.
test('predict mode asks for the next step and scores the answer', async ({ page }) => {
  await page.goto('/visualizations/renditja');
  await page.getByRole('radio', { name: 'Selection' }).click();
  const predict = page.getByTestId('predict');
  await predict.getByText('Parashiko', { exact: true }).click();
  await expect(predict.getByRole('switch', { name: 'Parashiko' })).toBeChecked();
  await page.getByRole('button', { name: 'Hapi tjetër (→)' }).click();
  const question = predict.getByRole('group', { name: /Cili element do të përfundojë në pozicionin 0/ });
  await expect(question).toBeVisible();
  await question.getByRole('button').first().click();
  await expect(page.getByTestId('predict-feedback')).toBeVisible();
  await expect(predict).toContainText('/1 parashikime të sakta');
});

// #148: Floyd-Warshall asks what a comparison through k does, starting with the Lab 8 class problem.
test('predict mode in Floyd-Warshall checks the rule D[i][j] = min(D[i][j], D[i][k] + D[k][j])', async ({ page }) => {
  await page.goto('/visualizations/floyd-warshall');
  const predict = page.getByTestId('predict');
  await predict.getByText('Parashiko', { exact: true }).click();
  // Skipping ahead stops at the first open comparison: through 0, 5 + 7 = 12 does not beat 1.
  await page.getByRole('button', { name: 'Shko te fundi (End)' }).click();
  const question = predict.getByRole('group', { name: 'k = 0: çfarë bëhet D[2][3]?' });
  await question.getByRole('button', { name: 'mbetet 1' }).click();
  await expect(page.getByTestId('predict-feedback')).toContainText('Saktë!');
  await expect(predict).toContainText('1/1 parashikime të sakta');
});

// #149: Kruskal asks whether each edge joins the tree, once two edges are in it.
test('predict mode in Kruskal asks to accept or reject the next edge', async ({ page }) => {
  await page.goto('/visualizations/kruskal-prim');
  const predict = page.getByTestId('predict');
  await predict.getByText('Parashiko', { exact: true }).click();
  await page.getByRole('button', { name: 'Shko te fundi (End)' }).click();
  // A–D (5) and C–E (5) are in; D–F (6) joins two different parts of the forest.
  const question = predict.getByRole('group', { name: /brinja tjetër sipas peshës është D–F \(6\)/ });
  await question.getByRole('button', { name: 'pranohet' }).click();
  await expect(page.getByTestId('predict-feedback')).toContainText('Saktë!');
});

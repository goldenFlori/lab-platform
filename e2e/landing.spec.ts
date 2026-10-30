import { expect, test } from '@playwright/test';

// #103: the signed-out front page says what the platform does, plays a real visualization, and
// works in both languages without horizontal scroll on a phone.

test('the front page explains the platform, in both languages, and fits a phone', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Shihni algoritmin');
  await expect(page.getByRole('link', { name: 'Hyr' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Shikojeni në punë' }).click();
  await expect(page.getByRole('heading', { name: 'Provojeni këtu' })).toBeInViewport();
  // A real visualization, not a picture of one.
  await expect(page.locator('[data-viz-id="labirinti"] [aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByRole('region', { name: 'Çfarë bën' }).getByRole('heading', { level: 3 })).toHaveCount(6);
  await expect(page.getByText('Falas për një kurs.')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole('button', { name: /English/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('See the algorithm');
  await expect(page.getByRole('heading', { name: 'What it does' })).toBeVisible();
});

// #129: the hero runs the course's own algorithms; a visitor switches them and starts from any vertex.
test('the live graph runs BFS, DFS and Dijkstra from the vertex a visitor taps', async ({ page }) => {
  await page.goto('/');
  const graph = page.getByTestId('live-graph');
  await expect(graph.getByText('Radha (FIFO)')).toBeVisible();
  await graph.getByRole('button', { name: 'Dijkstra' }).click();
  await expect(graph.getByRole('button', { name: 'Dijkstra' })).toHaveAttribute('aria-pressed', 'true');
  await expect(graph.getByText('Radha me prioritet')).toBeVisible();
  const j = graph.getByRole('button', { name: 'Nis nga kulmi J' });
  await j.click();
  // Started from J: its distance stays 0 for the whole run (its badge, drawn above the vertex).
  await expect(graph.locator('[data-badge-for="J"]')).toContainText('0');
  await expect(graph.locator('p[aria-live="polite"]')).not.toBeEmpty();
  await graph.getByRole('button', { name: 'DFS' }).click();
  await expect(graph.getByText('Stiva (LIFO)')).toBeVisible();
});

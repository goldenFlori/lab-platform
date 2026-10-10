import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { slidesOf } from '../src/notebook/slides';
import { toStored } from '../src/notebook/stored';
import type { Embed } from '../src/shared/notebooks';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #15 is done when a whole lab can be presented with the keyboard alone.

const counter = (page: Page) => page.getByTestId('presentation-step');

async function position(page: Page) {
  const [at, of] = ((await counter(page).textContent()) ?? '0 / 0').split(' / ').map(Number);
  return { at: at ?? 0, of: of ?? 0 };
}

test('a whole lab is presented with the keyboard alone', async ({ browser, isMobile }) => {
  test.setTimeout(180_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const errors: string[] = [];
  staff.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource'))
      errors.push(message.text());
  });
  const { labPath, pageUrl } = await courseWithLab(staff, 'Presentation e2e');
  const raw = readFileSync('test/notebook/fixtures/notebooks/laborator-01.ipynb', 'utf8');
  const assets = new Map<string, Uint8Array>();
  const stored = toStored(await renderNotebook(raw, { assets }));
  const nb = await uploadNotebook(staff, labPath, { kind: 'main', title: 'Laboratori 1', raw, stored, assets });
  const embeds = JSON.parse(readFileSync('test/notebook/fixtures/embeds.json', 'utf8')) as Record<string, Embed[]>;
  await apiCall(staff, 'PUT', `${labPath}/notebooks/${nb.id}/embeds`, { embeds: embeds['laborator-01.ipynb'] });

  // Into presentation from the lab page, with the keyboard.
  await staff.goto(pageUrl);
  await staff.getByRole('link', { name: 'Prezanto' }).focus();
  await staff.keyboard.press('Enter');
  const dialog = staff.getByRole('dialog', { name: 'Prezantimi: Algoritmet e renditjes' });
  await expect(dialog).toBeVisible();
  await expect(counter(staff)).toHaveText(/^1 \/ \d+$/);
  // Its steps: each text, code and visualization cell, as the step logic makes them.
  const total = slidesOf(stored, embeds['laborator-01.ipynb'] ?? []).length;
  await expect(counter(staff)).toHaveText(`1 / ${total}`);

  // → through every step: an output shows before moving on, visualizations open in place.
  let outputs = 0;
  let visualizations = 0;
  for (let presses = 0; presses < total * 3; presses++) {
    if (await dialog.getByRole('button', { name: /Shfaq rezultatin/ }).isVisible()) outputs++;
    if (await dialog.locator('[data-viz-id]').count()) {
      await expect(dialog.locator('[data-viz-id]').getByRole('region')).toBeVisible();
      visualizations++;
    }
    const before = await position(staff);
    if (before.at === total && !(await dialog.getByRole('button', { name: /Shfaq rezultatin/ }).isVisible())) break;
    await staff.keyboard.press('ArrowRight');
    await expect
      .poll(
        async () =>
          (await position(staff)).at !== before.at ||
          !(await dialog.getByRole('button', { name: /Shfaq rezultatin/ }).isVisible()),
      )
      .toBe(true);
  }
  expect((await position(staff)).at).toBe(total);
  expect(outputs).toBeGreaterThan(0);
  expect(visualizations).toBe(embeds['laborator-01.ipynb']?.length);

  // Back, Space to hide and show an output, Home and End.
  await staff.keyboard.press('Home');
  await expect(counter(staff)).toHaveText(`1 / ${total}`);
  // The first step with an output; outputs shown earlier stay shown, like a slide that was built.
  const reveal = dialog.getByRole('button', { name: /Shfaq rezultatin/ });
  const shown = dialog.getByText('Rezultati', { exact: true }).first();
  for (let i = 0; i < total; i++) {
    if ((await reveal.isVisible()) || (await shown.isVisible())) break;
    await staff.keyboard.press('ArrowRight');
  }
  await expect(shown).toBeVisible();
  await staff.keyboard.press(' ');
  await expect(reveal).toBeVisible();
  await expect(shown).toBeHidden();
  await staff.keyboard.press(' ');
  await expect(shown).toBeVisible();
  await staff.keyboard.press('End');
  await expect(counter(staff)).toHaveText(`${total} / ${total}`);
  await staff.keyboard.press('ArrowLeft');
  await expect(counter(staff)).toHaveText(`${total - 1} / ${total}`);

  // Esc leaves, back to the same notebook.
  await staff.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(staff).toHaveURL(`${pageUrl}?notebook=${nb.id}`);
  expect(errors).toEqual([]);
  await staff.context().close();
});

test('staff switch to the solved code and its outputs; students do not see the solution', async ({
  browser,
  isMobile,
}) => {
  test.setTimeout(90_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { group, labPath, pageUrl } = await courseWithLab(staff, 'Presentation solution e2e', { open: true });
  const notebook = (code: string, outputs: unknown[]) =>
    JSON.stringify({
      cells: [
        { cell_type: 'markdown', source: '## Ushtrimi 1\n\nShkruani funksionin `shuma`.' },
        { cell_type: 'code', source: code, outputs },
      ],
      nbformat: 4,
    });
  const exercise = notebook('def shuma(a, b):\n    pass', []);
  const solved = notebook('def shuma(a, b):\n    return a + b\n\nprint(shuma(1, 2))', [
    { output_type: 'stream', name: 'stdout', text: '3\n' },
  ]);
  const main = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Ushtrime',
    raw: exercise,
    stored: toStored(await renderNotebook(exercise)),
  });
  await uploadNotebook(staff, labPath, {
    kind: 'solution',
    title: 'Ushtrime (zgjidhje)',
    raw: solved,
    stored: toStored(await renderNotebook(solved)),
  });

  await staff.goto(`${pageUrl}/present?notebook=${main.id}&step=1`);
  const dialog = staff.getByRole('dialog');
  await expect(dialog.getByText('pass')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Shfaq rezultatin/ })).toHaveCount(0);
  await staff.keyboard.press('s');
  await expect(dialog.getByRole('button', { name: 'Zgjidhja' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByText('return')).toBeVisible();
  await staff.keyboard.press(' ');
  await expect(dialog.locator('.nb-stream')).toHaveText('3');
  await staff.keyboard.press('s');
  await expect(dialog.getByText('pass')).toBeVisible();

  // A student, before the solutions open, presents the same notebook without a solution switch.
  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(`${pageUrl}/present?notebook=${main.id}&step=1`);
  await expect(student.getByRole('dialog').getByText('pass')).toBeVisible();
  await expect(student.getByRole('button', { name: 'Zgjidhja' })).toHaveCount(0);
  await student.keyboard.press('s');
  await expect(student.getByRole('dialog').getByText('return')).toHaveCount(0);
  await staff.context().close();
  await student.context().close();
});

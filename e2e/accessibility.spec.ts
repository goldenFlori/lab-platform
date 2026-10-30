import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #192: every main page passes the automated WCAG 2.2 A and AA checks (axe), for visitors, students and
// staff, on desktop and the 375 px phone. Each page's violations are listed with where they are.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const code = (source: string) => ({ cell_type: 'code', source, outputs: [] });
const md = (source: string) => ({ cell_type: 'markdown', source });
const NOTEBOOK = JSON.stringify({
  cells: [
    md('# Laboratori i provës\n\nNjë fletore për kontrollin e aksesueshmërisë.'),
    md('## Ushtrimi 1\n\nShkruani funksionin `shuma`.'),
    code('def shuma(a, b):\n    raise NotImplementedError'),
    md('## Labirinti'),
    code('print("BFS")'),
  ],
  nbformat: 4,
});

/** The page's violations, one line each, as soft failures: one run lists every page's. */
async function audit(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const lines = violations.map(
    (v) =>
      `${v.id} [${v.impact}] ${v.help}:\n${v.nodes
        .slice(0, 4)
        .map(
          (n) => `    ${n.html.slice(0, 160)}${n.any[0]?.message ? `\n      ${n.any[0].message.slice(0, 200)}` : ''}`,
        )
        .join('\n')}`,
  );
  expect.soft(lines, `${name} (${page.url()})`).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`every main page passes the automated accessibility checks (${scheme})`, async ({ browser, isMobile }) => {
    test.setTimeout(240_000);
    const visitor = await (
      await browser.newContext({ colorScheme: scheme, ...(isMobile ? { viewport: { width: 375, height: 812 } } : {}) })
    ).newPage();
    for (const [name, path] of [
      ['front page', '/'],
      ['sign in', '/login'],
      ['privacy', '/privacy'],
      ['get ready', '/ready'],
      ['visualizations', '/visualizations'],
      ['a visualization', '/visualizations/labirinti'],
    ] as const) {
      await visitor.goto(path);
      await expect(visitor.locator('html')).toHaveAttribute('data-theme', scheme);
      await audit(visitor, `${name}, ${scheme}`);
    }
    await visitor.context().close();

    const staff = await signIn(browser, E2E_STAFF, isMobile);
    await staff.emulateMedia({ colorScheme: scheme });
    const { course, group, labPath, pageUrl } = await courseWithLab(staff, 'Accessibility e2e', { open: true });
    const nb = await uploadNotebook(staff, labPath, {
      kind: 'main',
      title: 'Fletorja',
      raw: NOTEBOOK,
      stored: toStored(await renderNotebook(NOTEBOOK)),
    });
    await apiCall(staff, 'PUT', `${labPath}/notebooks/${nb.id}/embeds`, {
      embeds: [{ cell: 3, viz: 'labirinti', props: null }],
    });
    await apiCall(staff, 'PUT', `${labPath}/notebooks/${nb.id}/exercises`, {
      exercises: [{ cell: 2, title: 'Shuma', test: 'assert shuma(1, 2) == 3' }],
    });
    await apiCall(staff, 'PUT', `${labPath}/notebooks/${nb.id}/assignments/${group.id}`, {
      dueAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const coursePage = `/o/e2e/courses/${course.id}`;
    for (const [name, path] of [
      ['courses', '/courses'],
      ['course (staff)', coursePage],
      ['lab (staff)', `${pageUrl}?notebook=${nb.id}`],
      ['submissions', `${pageUrl}/submissions?notebook=${nb.id}`],
      ['activity', `${coursePage}/activity`],
      ['pilot report', `${coursePage}/report`],
      ['group', `${coursePage}/groups/${group.id}`],
      ['student import', `${coursePage}/groups/${group.id}/import`],
      ['my data', '/account/data'],
    ] as const) {
      await staff.goto(path);
      await audit(staff, `${name}, ${scheme}`);
    }
    await staff.context().close();

    const student = await signIn(browser, E2E_ACCOUNT, isMobile);
    await student.emulateMedia({ colorScheme: scheme });
    await apiCall(student, 'POST', '/join', { code: group.joinCode });
    for (const [name, path] of [
      ['course (student)', coursePage],
      ['lab (student)', `${pageUrl}?notebook=${nb.id}`],
      ['my progress', `${coursePage}/progress`],
      ['review', `${coursePage}/review`],
    ] as const) {
      await student.goto(path);
      await audit(student, `${name}, ${scheme}`);
    }
    await student.context().close();
  });
}

/** Presses Tab until the focused element is named like `name`; fails after `most` presses. */
async function tabTo(page: Page, name: RegExp, most = 120) {
  for (let i = 0; i < most; i++) {
    await page.keyboard.press('Tab');
    // Only a control counts: past the page's end, focus rests on the body, whose text is everything.
    const label = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || !el.matches('a, button, input, textarea, select, [tabindex]')) return '';
      return el.getAttribute('aria-label') ?? el.textContent ?? '';
    });
    if (name.test(label)) return;
  }
  throw new Error(`Tab never reached ${name}`);
}

test('a lab works with the keyboard alone', async ({ browser, isMobile }) => {
  test.skip(isMobile, 'a keyboard, on a computer');
  test.setTimeout(150_000);
  const staff = await signIn(browser, E2E_STAFF, false);
  const { group, labPath, pageUrl } = await courseWithLab(staff, 'Keyboard e2e', { open: true });
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Fletorja',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });
  await apiCall(staff, 'PUT', `${labPath}/notebooks/${nb.id}/assignments/${group.id}`, {
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  await staff.context().close();

  const student = await signIn(browser, E2E_ACCOUNT, false);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(`${pageUrl}?notebook=${nb.id}`);
  await expect(student.getByRole('button', { name: 'Ekzekuto qelizën 2', exact: true })).toBeVisible();

  // Tab reaches a cell's Run, and Enter runs it.
  await tabTo(student, /^Ekzekuto qelizën 2$/);
  await student.keyboard.press('Enter');
  await expect(student.locator('[data-testid="run-output"][data-cell="2"]')).toContainText('BFS', { timeout: 90_000 });

  // Enter opens a cell's code to edit; typing works; Escape then Tab leaves the editor (no trap).
  await student.getByRole('button', { name: 'Ndrysho kodin e qelizës 1' }).focus();
  await student.keyboard.press('Enter');
  const editor = student.getByRole('textbox', { name: 'Kodi i qelizës 1' });
  await expect(editor).toBeFocused();
  await student.keyboard.press('ControlOrMeta+a');
  await student.keyboard.type('def shuma(a, b): return a + b');
  await student.keyboard.press('Escape');
  await student.keyboard.press('Tab');
  await expect(editor).not.toBeFocused();

  // Handing in, confirmation included, from the keyboard.
  await tabTo(student, /Dorëzo punën/, 200);
  await student.keyboard.press('Enter');
  const dialog = student.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await tabTo(student, /Dorëzo punën/, 5);
  await student.keyboard.press('Enter');
  await expect(student.getByTestId('submission')).toContainText('Puna u dorëzua.');
  await student.context().close();
});

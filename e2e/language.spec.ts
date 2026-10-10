import { expect, type Page, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import type { Me } from '../src/shared/auth';
import { hashPassword } from '../src/shared/password';
import type { GroupStudent } from '../src/shared/students';
import { E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #19 is done when every screen exists in both languages. The shared test accounts stay in
// Albanian for the other tests: staff see English through this device's choice, and the account
// preference is tried on students made for this test.

/** The interface's own text and labels: what is left once the course's content and the visualizations are taken out. */
async function interfaceText(page: Page) {
  return page.evaluate(() => {
    const copy = document.body.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('article, .notebook, .notebook-step, [data-viz-id], [data-content]').forEach((el) => {
      el.remove();
    });
    // What screen readers hear, too.
    const labels = Array.from(copy.querySelectorAll('[aria-label], [placeholder], [title]'), (el) =>
      ['aria-label', 'placeholder', 'title'].map((name) => el.getAttribute(name) ?? '').join(' '),
    );
    return `${copy.innerText}\n${labels.join('\n')}`;
  });
}

async function expectEnglish(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const text = await interfaceText(page);
  // Albanian's own letters, or its most common interface words, would mean a missed message.
  expect(text, page.url()).not.toMatch(/[ëçËÇ]|\b(Kurset|Laboratori|Fletor|Grupi|Studentët|Shto|Anulo|Duke)\b/);
}

async function newStudent(staff: Page, coursePath: string, groupId: string, fullName: string) {
  const password = `Provë-${crypto.randomUUID().slice(0, 8)}`;
  const base = fullName.toLowerCase().replace(/[^a-z]+/g, '.');
  const {
    students: [student],
  } = await apiCall<{ students: GroupStudent[] }>(staff, 'POST', `${coursePath}/groups/${groupId}/students`, {
    students: [{ fullName, username: base, passwordHash: await hashPassword(password) }],
  });
  if (!student) throw new Error('No student was made');
  return { username: student.username, password };
}

test('a visitor switches the interface to English, and it stays so on this device', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Shihni algoritmin');
  await page.getByRole('button', { name: 'Gjuha: English' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('See the algorithm');
  await expectEnglish(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
  await expect(page).toHaveTitle(/^Sign in/);
  await expectEnglish(page);
  await page.getByRole('button', { name: 'Language: Shqip' }).click();
  await expect(page.getByRole('heading', { name: 'Hyr në llogari' })).toBeVisible();
});

test('every staff screen reads in English', async ({ browser, isMobile }) => {
  test.setTimeout(120_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group, lab, labPath, pageUrl } = await courseWithLab(staff, 'Language e2e', { open: true });
  const raw = JSON.stringify({
    cells: [
      { cell_type: 'markdown', source: '## Ushtrimi 1\n\nRenditja me futje.' },
      {
        cell_type: 'code',
        source: 'print(sorted([3, 1, 2]))',
        outputs: [{ output_type: 'stream', name: 'stdout', text: '[1, 2, 3]\n' }],
      },
    ],
    nbformat: 4,
  });
  await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Main',
    raw,
    stored: toStored(await renderNotebook(raw)),
  });
  const courseUrl = `/o/e2e/courses/${course.id}`;
  // Names are the course's own data, not the interface: give the group one that reads in both.
  await apiCall(staff, 'PATCH', `/orgs/e2e/courses/${course.id}/groups/${group.id}`, { name: 'Group A' });
  await staff.evaluate(() => localStorage.setItem('locale', 'en'));

  for (const url of [
    '/courses',
    courseUrl,
    `${courseUrl}/groups/${group.id}`,
    `${courseUrl}/groups/${group.id}/import`,
    `${courseUrl}/activity`,
    pageUrl,
    '/visualizations',
    '/visualizations/renditja',
    '/no-such-page',
  ]) {
    await staff.goto(url);
    await expect(staff.locator('main h1, main [role="heading"]').first()).toBeVisible();
    await expectEnglish(staff);
  }
  await staff.goto(pageUrl);
  await expect(staff.getByRole('link', { name: 'Download the notebook' })).toBeVisible();
  await expect(staff).toHaveTitle(new RegExp(`^${lab.title}`));

  // The presentation, and the search palette.
  await staff.goto(`${pageUrl}/present`);
  await expect(staff.getByRole('dialog', { name: `Presentation: ${lab.title}` })).toBeVisible();
  await expectEnglish(staff);
  await staff.goto('/courses');
  await staff
    .getByRole('button', { name: /^Search/ })
    .first()
    .click();
  await expect(staff.getByRole('combobox', { name: 'Search' })).toBeFocused();
  await staff.getByRole('combobox', { name: 'Search' }).fill('dijkstra');
  await expect(staff.getByRole('option', { name: /Dijkstra versus Bellman-Ford/ })).toBeVisible();
  await staff.context().close();
});

test("a student's choice goes with the account; a course's language serves those who have not chosen", async ({
  browser,
  isMobile,
}) => {
  test.setTimeout(90_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group } = await courseWithLab(staff, 'Language course e2e');
  const coursePath = `/orgs/e2e/courses/${course.id}`;
  const chooser = await newStudent(staff, coursePath, group.id, 'Ana Zgjedhja');
  const follower = await newStudent(staff, coursePath, group.id, 'Besa Ndjekja');

  // Ana picks English from her account menu; on another device, signed in again, it is still English.
  const ana = await signIn(browser, chooser, isMobile);
  await ana.getByRole('button', { name: /^Llogaria:/ }).click();
  await ana.getByRole('menuitem', { name: 'English' }).click();
  await expect(ana.getByRole('heading', { name: 'My courses' })).toBeVisible();
  await expect.poll(async () => (await apiCall<Me>(ana, 'GET', '/me')).user.locale).toBe('en');
  await ana.context().close();
  const again = await signIn(browser, chooser, isMobile);
  await expect(again.getByRole('heading', { name: 'My courses' })).toBeVisible();
  await again.context().close();

  // The course is set to English: Besa, who has not chosen, sees it in English, and her course list in Albanian.
  await apiCall(staff, 'PATCH', coursePath, { locale: 'en' });
  const besa = await signIn(browser, follower, isMobile);
  await expect(besa.getByRole('heading', { name: 'Kurset e mia' })).toBeVisible();
  await besa.goto(`/o/e2e/courses/${course.id}`);
  await expect(besa.getByRole('heading', { name: 'Labs' })).toBeVisible();
  await expectEnglish(besa);
  await besa.context().close();
  await staff.context().close();
});

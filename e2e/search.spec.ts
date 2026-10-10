import { expect, type Page, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import type { LabView } from '../src/shared/labs';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #17 is done when a student never sees search results from a hidden lab. The words searched for
// are made up per run, so other tests' courses cannot match them.

const word = (prefix: string) => `${prefix}${crypto.randomUUID().slice(0, 8)}`;

async function openSearch(page: Page, isMobile: boolean) {
  const box = page.getByRole('combobox', { name: 'Kërko' });
  if (isMobile) await page.getByRole('button', { name: 'Kërko', exact: true }).click();
  else {
    // The shortcut works once the header has mounted; a page that has just loaded may not be there yet.
    await expect(page.getByRole('button', { name: /^Kërko/ })).toBeVisible();
    await expect(async () => {
      await page.keyboard.press('Control+k');
      await expect(box).toBeVisible({ timeout: 1000 });
    }).toPass();
  }
  await expect(box).toBeFocused();
  return box;
}

async function upload(staff: Page, labPath: string, title: string, markdown: string[]) {
  const raw = JSON.stringify({ cells: markdown.map((source) => ({ cell_type: 'markdown', source })), nbformat: 4 });
  return uploadNotebook(staff, labPath, { kind: 'main', title, raw, stored: toStored(await renderNotebook(raw)) });
}

test('a student finds what is open to them, never a hidden lab; staff find both', async ({ browser, isMobile }) => {
  test.setTimeout(90_000);
  const open = word('hapur');
  const hidden = word('fshehur');
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, group, labPath, pageUrl } = await courseWithLab(staff, 'Search e2e', { open: true });
  const filler = Array.from(
    { length: 12 },
    (_, i) => `## Pjesa ${i + 1}\n\n${'Tekst hyrës për renditjen. '.repeat(40)}`,
  );
  const nb = await upload(staff, labPath, 'Rrugët', [
    '# Rrugët më të shkurtra',
    ...filler,
    `## Rruga ${open}\n\nAlgoritmi i Dijkstrës gjen rrugën ${open}.`,
  ]);
  const coursePath = `/orgs/e2e/courses/${course.id}`;
  const secret = await apiCall<LabView>(staff, 'POST', `${coursePath}/labs`, { n: 2, title: 'Laboratori i fshehur' });
  await upload(staff, `${coursePath}/labs/${secret.id}`, 'Sekreti', [`## Sekreti ${hidden}\n\nAsgjë për studentët.`]);

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto('/courses');
  let box = await openSearch(student, isMobile);
  await box.fill(hidden);
  await expect(student.getByText(`Asnjë rezultat për “${hidden}”.`)).toBeVisible();

  // The open lab's section, found without its accents, opens at its heading.
  await box.fill(`dijkstres ${open}`);
  const hit = student.getByRole('option', { name: new RegExp(`Rruga ${open}`) });
  await expect(hit).toBeVisible();
  await expect(hit).toHaveAttribute('aria-selected', 'true');
  await expect(hit).toContainText('Laboratori 1 · Rrugët');
  await box.press('Enter');
  await expect(student).toHaveURL(`${pageUrl}?notebook=${nb.id}#rruga-${open}`);
  await expect(student.getByRole('heading', { name: `Rruga ${open}` })).toBeInViewport();

  // Staff search every lab, the hidden one too.
  await staff.goto('/courses');
  box = await openSearch(staff, isMobile);
  await box.fill(hidden);
  await expect(staff.getByRole('option', { name: new RegExp(`Sekreti ${hidden}`) })).toContainText('Laboratori 2');
  await student.context().close();
  await staff.context().close();
});

test('the visualizations are found by name, with or without accents', async ({ browser, isMobile }) => {
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const box = await openSearch(staff, isMobile);
  await box.fill('ciftezim');
  const hit = staff.getByRole('option', { name: /Çiftëzimi & caktimet/ });
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(staff).toHaveURL('/visualizations/ciftezimi');
  await expect(staff.getByRole('combobox', { name: 'Kërko' })).toBeHidden();
  await staff.context().close();
});

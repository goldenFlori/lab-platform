import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { hashPassword } from '../src/shared/password';
import { E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #203: a pedagog shares a course with a link; the admin of a fresh institution opens it, copies the
// course into their own, and finds its lab with the notebook and its visualization; the pedagog then
// sees who copied it.

test('a course shared with another institution is copied with its notebooks', async ({ browser, isMobile }) => {
  test.setTimeout(150_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, labPath } = await courseWithLab(staff, 'Ndarje e2e');
  const raw = await readFile('test/notebook/fixtures/notebooks/laborator-01.ipynb', 'utf8');
  const assets = new Map<string, Uint8Array>();
  const stored = toStored(await renderNotebook(raw, { assets }));
  const main = await uploadNotebook(staff, labPath, { kind: 'main', title: 'Laboratori 1', raw, stored, assets });
  await apiCall(staff, 'PUT', `${labPath}/notebooks/${main.id}/embeds`, {
    embeds: [{ cell: 1, viz: 'renditja', title: 'Insertion Sort hap pas hapi', props: { algo: 'insertion' } }],
  });

  // The pedagog makes the link on the course page.
  await staff.goto(`/o/e2e/courses/${course.id}`);
  const section = staff.getByTestId('course-share');
  await section.getByRole('button', { name: 'Krijo lidhjen' }).click();
  const link = await section.getByLabel('Lidhja e ndarjes').inputValue();
  expect(link).toMatch(/\/share\/[0-9a-f]{32}$/);

  // A fresh institution, so its admin may create courses there and nowhere else.
  const suffix = crypto
    .randomUUID()
    .slice(0, 6)
    .replace(/[^a-z]/g, 'x');
  const slug = `share-${suffix}`;
  const admin = { username: `share.admin${suffix}`, password: `Share-${suffix}-2026` };
  await apiCall(staff, 'POST', '/platform/institutions', {
    name: `Kolegji ${suffix}`,
    slug,
    admin: { fullName: 'Admin Kolegji', username: admin.username, passwordHash: await hashPassword(admin.password) },
  });

  const page = await signIn(browser, admin, isMobile);
  await page.goto(new URL(link).pathname);
  await expect(page.getByRole('heading', { level: 1, name: `Kopjo «${course.title}»` })).toBeVisible();
  await expect(page.getByText('1 fletore')).toBeVisible();
  await expect(page.getByText('Pa zgjidhjet.')).toBeVisible();
  await page.getByLabel('Titulli i kursit të ri').fill('Algoritmet');
  await page.getByRole('button', { name: 'Krijo kursin' }).click();

  // The new course says where it came from, and its lab has the notebook with its visualization.
  await expect(page).toHaveURL(new RegExp(`/o/${slug}/courses/[0-9a-f-]+$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Algoritmet' })).toBeVisible();
  await expect(page.getByText(`Kopjuar nga «${course.title}»`)).toBeVisible();
  await page.getByRole('link', { name: 'Algoritmet e renditjes', exact: true }).click();
  // A visualization loads once it scrolls into view.
  const embed = page.locator('[data-viz-id="renditja"]').first();
  await embed.scrollIntoViewIfNeeded();
  await expect(embed.getByRole('region').getByRole('heading', { name: /Insertion Sort/ })).toBeVisible();
  await page.context().close();

  // The pedagog sees the copy; stopping the share leaves it in place.
  await staff.reload();
  await expect(staff.getByTestId('share-copies')).toContainText(`Kolegji ${suffix}`);
  await staff.getByTestId('course-share').getByRole('button', { name: 'Ndalo ndarjen' }).click();
  await expect(staff.getByTestId('course-share').getByRole('button', { name: 'Krijo lidhjen' })).toBeVisible();
  await expect(staff.getByTestId('share-copies')).toContainText(`Kolegji ${suffix}`);
  await staff.context().close();
});

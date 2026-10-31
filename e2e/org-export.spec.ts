import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import type { OrganizationExport } from '../src/shared/org-export';
import { E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { signIn } from './sign-in';

// #117: the institution's admin downloads its data as one file, its notebooks' originals included.

const NOTEBOOK = JSON.stringify({ cells: [{ cell_type: 'markdown', source: '# Eksporti' }], nbformat: 4 });

test("the admin downloads the institution's data as one file", async ({ browser, isMobile }) => {
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { course, labPath } = await courseWithLab(staff, 'Export e2e');
  const nb = await uploadNotebook(staff, labPath, {
    kind: 'main',
    title: 'Eksporti',
    raw: NOTEBOOK,
    stored: toStored(await renderNotebook(NOTEBOOK)),
  });

  await staff.goto('/o/e2e/admin');
  const download = staff.waitForEvent('download');
  await staff.getByTestId('org-export').getByRole('button', { name: 'Shkarko (JSON)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^e2e-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile((await file.path()) ?? '', 'utf8')) as OrganizationExport;
  expect(data.organization.slug).toBe('e2e');
  // Its look comes along (#201); the e2e institution has neither accent nor logo.
  expect(data.branding).toEqual({ accent: null, logo: null });
  expect(data.tables.courses.map((c) => c.id)).toContain(course.id);
  expect(data.tables.people.map((p) => p.username)).toContain(E2E_STAFF.username);
  expect(data.notebookFiles[nb.id]).toMatchObject({ cells: [{ cell_type: 'markdown' }] });
  await staff.context().close();
});

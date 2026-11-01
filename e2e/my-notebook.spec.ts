import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #214: a student downloads their own version of a notebook, an .ipynb with their code in its cell.

test('a student downloads the notebook with their own code', async ({ browser, isMobile }) => {
  test.setTimeout(120_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { group, labPath, pageUrl } = await courseWithLab(staff, 'Fletorja ime e2e', { open: true });
  const raw = await readFile('test/notebook/fixtures/notebooks/laborator-01.ipynb', 'utf8');
  const assets = new Map<string, Uint8Array>();
  const stored = toStored(await renderNotebook(raw, { assets }));
  const main = await uploadNotebook(staff, labPath, { kind: 'main', title: 'Laboratori 1', raw, stored, assets });
  await staff.context().close();

  const cell = stored.cells.find((c) => c.type === 'code' && !c.interactive)?.srcIndex ?? -1;
  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await apiCall(student, 'PUT', `${labPath}/notebooks/${main.id}/work`, {
    code: [{ cell, code: 'print("kodi im")\n' }],
    traces: [],
    version: main.version,
  });

  await student.goto(`${pageUrl}?notebook=${main.id}`);
  const [download] = await Promise.all([
    student.waitForEvent('download'),
    student.getByRole('button', { name: 'Shkarko versionin tim' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Laboratori 1 (versioni im).ipynb');
  const nb = JSON.parse(await readFile((await download.path()) as string, 'utf8')) as {
    cells: { source: string[]; outputs?: unknown[] }[];
  };
  expect(nb.cells[cell]).toMatchObject({ source: ['print("kodi im")\n'], outputs: [] });
  expect(nb.cells).toHaveLength((JSON.parse(raw) as { cells: unknown[] }).cells.length);
  await student.context().close();
});

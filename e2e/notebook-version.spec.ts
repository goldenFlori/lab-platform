import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { toStored } from '../src/notebook/stored';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { courseWithLab, uploadNotebook } from './notebooks';
import { apiCall, signIn } from './sign-in';

// #208: staff put a corrected notebook in place during the term. A student's saved code stays in its
// cell, which a new cell above has moved, and they are told the original changed.

test('a new version of a notebook keeps a student’s code in its cell', async ({ browser, isMobile }) => {
  test.setTimeout(150_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const { group, labPath, pageUrl } = await courseWithLab(staff, 'Versione e2e', { open: true });
  const raw = await readFile('test/notebook/fixtures/notebooks/laborator-01.ipynb', 'utf8');
  const assets = new Map<string, Uint8Array>();
  const stored = toStored(await renderNotebook(raw, { assets }));
  const main = await uploadNotebook(staff, labPath, { kind: 'main', title: 'Laboratori 1', raw, stored, assets });

  // The student's own code in the first code cell, saved.
  const nb = JSON.parse(raw) as { cells: { cell_type: string; source: string | string[] }[] };
  // The first cell students can edit here: not one that opens a desktop window.
  const first = stored.cells.find((c) => c.type === 'code' && !c.interactive)?.srcIndex ?? -1;
  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await apiCall(student, 'PUT', `${labPath}/notebooks/${main.id}/work`, {
    code: [{ cell: first, code: 'print("kodi im")' }],
    traces: [],
    version: main.version,
  });

  // Version 2: a note at the top, and that cell corrected.
  const cells = structuredClone(nb.cells);
  const source = (c: { source: string | string[] }) => (Array.isArray(c.source) ? c.source.join('') : c.source);
  cells[first] = { ...cells[first], source: `${source(cells[first] as never)}\n# korrigjuar` } as never;
  cells.splice(1, 0, { cell_type: 'markdown', source: 'Shënim i versionit të ri.' } as never);
  const v2 = JSON.stringify({ ...nb, cells });

  await staff.goto(`${pageUrl}?notebook=${main.id}`);
  await staff.getByRole('button', { name: 'Më shumë veprime me fletoret' }).click();
  await staff.getByRole('menuitem', { name: 'Ngarko një version të ri' }).click();
  const panel = staff.getByTestId('notebook-version');
  await panel.getByLabel('Fletorja (.ipynb)').setInputFiles({
    name: 'laborator-01.ipynb',
    mimeType: 'application/x-ipynb+json',
    buffer: Buffer.from(v2),
  });
  await panel.getByRole('button', { name: 'Krahaso' }).click();
  await expect(panel.getByTestId('version-plan')).toContainText('1 të ndryshuara, 1 të reja, 0 të hequra');
  await expect(panel).toContainText('Në 1 qelizë që ndryshoi ka kod studentësh');
  await panel.getByRole('button', { name: 'Vendos versionin e ri' }).click();
  await expect(staff.getByText('Shënim i versionit të ri.')).toBeVisible();
  await staff.context().close();

  // The student finds the new version, their code in its cell, and the note.
  await student.goto(`${pageUrl}?notebook=${main.id}`);
  await expect(student.getByText('Shënim i versionit të ri.')).toBeVisible();
  await expect(student.getByText('print("kodi im")')).toBeVisible();
  await expect(
    student.getByText('Origjinali i kësaj qelize ndryshoi pasi e ndryshuat.', { exact: false }),
  ).toBeVisible();
  await student.context().close();
});

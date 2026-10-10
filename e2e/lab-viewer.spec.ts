import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { expect, type Page, test } from '@playwright/test';
import { renderNotebook } from '../src/notebook';
import { type StoredNotebook, toStored } from '../src/notebook/stored';
import type { CodeFlags } from '../src/notebook/types';
import type { CourseSummary, GroupView } from '../src/shared/courses';
import type { LabView } from '../src/shared/labs';
import type { NotebookSummary } from '../src/shared/notebooks';
import { E2E_ACCOUNT, E2E_STAFF } from './account';
import { apiCall, signIn } from './sign-in';

// A pedagog's notebook, uploaded the way the app's upload will do it, then read by a student.

const MIME: Record<string, string> = { png: 'image/png', svg: 'image/svg+xml', json: 'application/json' };

async function upload(
  staff: Page,
  lab: string,
  notebook: {
    kind: 'main' | 'extra';
    title: string;
    raw: string;
    stored: StoredNotebook;
    assets?: Map<string, Uint8Array>;
  },
) {
  const created = await apiCall<NotebookSummary>(staff, 'POST', `${lab}/notebooks`, {
    kind: notebook.kind,
    title: notebook.title,
    originalName: `${notebook.title}.ipynb`,
    sha256: createHash('sha256').update(notebook.raw).digest('hex'),
  });
  const files = `${lab}/notebooks/${created.id}/files`;
  const put = (name: string, data: Buffer, type: string, gzipped = false) =>
    apiCall(staff, 'PUT', `${files}/${name}`, data, {
      'Content-Type': type,
      ...(gzipped ? { 'X-Content-Encoding': 'gzip' } : {}),
    });
  await put('notebook.ipynb', Buffer.from(notebook.raw), 'application/x-ipynb+json');
  await put('rendered.json', gzipSync(JSON.stringify(notebook.stored)), 'application/json', true);
  for (const [name, data] of notebook.assets ?? []) {
    const type = MIME[name.split('.').pop() ?? ''] ?? 'application/octet-stream';
    const json = type === 'application/json';
    await put(name, json ? gzipSync(data) : Buffer.from(data), type, json);
  }
  await apiCall(staff, 'POST', `${lab}/notebooks/${created.id}/ready`);
  return created;
}

const noFlags: CodeFlags = {
  pygame: false,
  tkinter: false,
  widgets: false,
  plotly: false,
  subprocess: false,
  sysexit: false,
  networkx: false,
  matplotlib: false,
};

/** A rendering made by hand, bypassing the converter, as someone calling the API could upload it. */
const hostile: StoredNotebook = {
  format: 1,
  title: 'Provë sigurie',
  toc: [],
  tocFull: [],
  sections: [],
  cells: [
    {
      type: 'markdown',
      kind: 'normal',
      srcIndex: 0,
      html:
        '<p>Hyrje e padëmshme</p><img src="x" onerror="window.__xss = 1"><script>window.__xss = 2</script>' +
        '<form action="https://example.com"><input name="password" placeholder="Fjalëkalimi"></form>' +
        '<a href="https://example.com/burim">Lidhje e jashtme</a> <a href="javascript:window.__xss = 3">Lidhje e keqe</a>' +
        '<style>body { display: none }</style>',
    },
    {
      type: 'code',
      srcIndex: 1,
      interactive: false,
      html: '<pre><code onmouseover="window.__xss = 4">print(1)</code></pre>',
      raw: 'print(1)',
      lines: 1,
      collapsed: false,
      summary: [],
      flags: noFlags,
      externalScripts: [],
      outputs: [
        {
          kind: 'html',
          html: '<div onclick="window.__xss = 5">tabela</div><iframe src="https://example.com"></iframe>',
        },
      ],
    },
  ],
  imports: [],
  dependencies: [],
  flags: {
    pygame: false,
    tkinter: false,
    widgets: false,
    plotly: false,
    matplotlib: false,
    networkx: false,
    numpy: false,
  },
  missingScripts: [],
  stats: { cells: 2, markdown: 1, code: 1, codeLines: 1 },
  hasEmbeddedHomework: false,
  hasClasswork: false,
};

test('a student reads a course notebook with its outputs, figures and visualizations', async ({
  browser,
  isMobile,
}) => {
  test.setTimeout(120_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const title = `Lab viewer e2e ${crypto.randomUUID().slice(0, 6)}`;

  // A course with a group and an open lab.
  const course = await apiCall<CourseSummary>(staff, 'POST', '/orgs/e2e/courses', { title, academicYear: '2026/27' });
  const coursePath = `/orgs/e2e/courses/${course.id}`;
  const group = await apiCall<GroupView>(staff, 'POST', `${coursePath}/groups`, { name: 'Grupi A' });
  const lab = await apiCall<LabView>(staff, 'POST', `${coursePath}/labs`, { n: 1, title: 'Algoritmet e renditjes' });
  const labPath = `${coursePath}/labs/${lab.id}`;
  await apiCall(staff, 'PUT', `${labPath}/access`, {
    groupId: null,
    visibleFrom: new Date(Date.now() - 60_000).toISOString(),
    visibleUntil: null,
    solutionsFrom: null,
  });

  // Lab 1 of the course, converted as the browser will convert it, with the site's two embeds.
  const raw = await readFile('test/notebook/fixtures/notebooks/laborator-01.ipynb', 'utf8');
  const assets = new Map<string, Uint8Array>();
  const stored = toStored(await renderNotebook(raw, { assets }));
  const main = await upload(staff, labPath, { kind: 'main', title: 'Laboratori 1', raw, stored, assets });
  await apiCall(staff, 'PUT', `${labPath}/notebooks/${main.id}/embeds`, {
    embeds: [
      { cell: 1, viz: 'renditja', title: 'Insertion Sort hap pas hapi', props: { algo: 'insertion' } },
      { cell: 3, viz: 'renditja', title: 'Selection Sort hap pas hapi', props: { algo: 'selection' } },
    ],
  });

  // The student joins the group and opens the lab from the course page.
  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(`/o/e2e/courses/${course.id}`);
  await student.getByRole('link', { name: 'Algoritmet e renditjes' }).click();
  await expect(student).toHaveURL(`/o/e2e/courses/${course.id}/labs/${lab.id}`);
  await expect(student).toHaveTitle('Algoritmet e renditjes · Lab Platform');
  await expect(student.getByRole('heading', { level: 1, name: 'Algoritmet e renditjes' })).toBeVisible();
  await expect(student.getByRole('link', { name: 'Shkarko fletoren' })).toHaveAttribute(
    'href',
    `/api${labPath}/notebooks/${main.id}/files/notebook.ipynb`,
  );

  // The notebook's sections, in the reading column and (on wide screens) the table of contents.
  const firstSection = stored.toc[0];
  if (!firstSection) throw new Error('Lab 1 has sections');
  await expect(student.locator(`article [id="${firstSection.id}"]`)).toBeAttached();
  const toc = student.getByRole('navigation', { name: 'Përmbajtja' });
  if (isMobile) await expect(toc).toBeHidden();
  else await expect(toc.getByRole('link', { name: firstSection.title })).toBeVisible();

  // An exercise that opens a Pygame window: its interactive version comes first, the code folds under it.
  const insertion = student.getByText('Versioni interaktiv · Insertion Sort hap pas hapi');
  await insertion.scrollIntoViewIfNeeded();
  const viz = student.locator('[data-viz-id="renditja"]').first().getByRole('region');
  await expect(viz).toBeVisible();
  await expect(viz.getByRole('heading', { name: /Insertion Sort/ })).toBeVisible();
  const folded = student.getByText('Kodi Python i ushtrimit').first();
  expect((await insertion.boundingBox())?.y ?? 0).toBeLessThan((await folded.boundingBox())?.y ?? 0);
  await expect(student.getByText('Versioni interaktiv · Selection Sort hap pas hapi')).toBeAttached();

  // A saved image output, served from the API with the student's session.
  const image = student.getByAltText('Figura e prodhuar nga kodi i mësipërm').first();
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // A Plotly figure, drawn again so it stays interactive.
  const figure = student.locator('.plotly-figure').first();
  await figure.scrollIntoViewIfNeeded();
  await expect(figure.locator('.main-svg').first()).toBeVisible({ timeout: 20_000 });

  const overflow = await student.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await staff.context().close();
  await student.context().close();
});

test('notebook HTML cannot run code, ask for passwords or hide the page', async ({ browser, isMobile }) => {
  test.setTimeout(60_000);
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const course = await apiCall<CourseSummary>(staff, 'POST', '/orgs/e2e/courses', {
    title: `Lab security e2e ${crypto.randomUUID().slice(0, 6)}`,
    academicYear: '2026/27',
  });
  const coursePath = `/orgs/e2e/courses/${course.id}`;
  const lab = await apiCall<LabView>(staff, 'POST', `${coursePath}/labs`, { n: 2, title: 'Provë' });
  const labPath = `${coursePath}/labs/${lab.id}`;
  const raw = JSON.stringify({ cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 });
  const nb = await upload(staff, labPath, { kind: 'main', title: 'Provë sigurie', raw, stored: hostile });

  await staff.goto(`/o/e2e/courses/${course.id}/labs/${lab.id}?notebook=${nb.id}`);
  const article = staff.locator('article');
  await expect(article.getByText('Hyrje e padëmshme')).toBeVisible();
  await expect(article.getByText('tabela')).toBeVisible();
  await article.getByText('print(1)').hover();
  await article.getByText('tabela').click();

  expect(await staff.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await expect(article.locator('script, style, form, input, iframe, [onerror], [onclick], [onmouseover]')).toHaveCount(
    0,
  );
  await expect(article.getByRole('link', { name: 'Lidhje e jashtme' })).toHaveAttribute('target', '_blank');
  await expect(article.getByRole('link', { name: 'Lidhje e jashtme' })).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(article.getByText('Lidhje e keqe')).not.toHaveAttribute('href', /javascript:/);
  await expect(staff.locator('body')).toBeVisible();
  await staff.context().close();
});

test('a lab the student may not see is a 404, like a missing one', async ({ browser, isMobile }) => {
  const staff = await signIn(browser, E2E_STAFF, isMobile);
  const course = await apiCall<CourseSummary>(staff, 'POST', '/orgs/e2e/courses', {
    title: `Lab hidden e2e ${crypto.randomUUID().slice(0, 6)}`,
    academicYear: '2026/27',
  });
  const coursePath = `/orgs/e2e/courses/${course.id}`;
  const group = await apiCall<GroupView>(staff, 'POST', `${coursePath}/groups`, { name: 'Grupi A' });
  const lab = await apiCall<LabView>(staff, 'POST', `${coursePath}/labs`, { n: 3, title: 'E fshehur' });

  const student = await signIn(browser, E2E_ACCOUNT, isMobile);
  await apiCall(student, 'POST', '/join', { code: group.joinCode });
  await student.goto(`/o/e2e/courses/${course.id}/labs/${lab.id}`);
  await expect(student.getByRole('heading', { level: 1 })).toHaveText('Kjo rrugë nuk ekziston në graf');
  await staff.context().close();
  await student.context().close();
});

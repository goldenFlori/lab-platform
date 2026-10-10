import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { Page } from '@playwright/test';
import type { StoredNotebook } from '../src/notebook/stored';
import type { CourseSummary, GroupView } from '../src/shared/courses';
import type { LabView } from '../src/shared/labs';
import type { NotebookKind, NotebookSummary } from '../src/shared/notebooks';
import { apiCall } from './sign-in';

const MIME: Record<string, string> = { png: 'image/png', svg: 'image/svg+xml', json: 'application/json' };

/** A new course in the E2E organization, with one group and one lab, made by its admin. */
export async function courseWithLab(staff: Page, name: string, { open = false } = {}) {
  const course = await apiCall<CourseSummary>(staff, 'POST', '/orgs/e2e/courses', {
    title: `${name} ${crypto.randomUUID().slice(0, 6)}`,
    academicYear: '2026/27',
  });
  const coursePath = `/orgs/e2e/courses/${course.id}`;
  const group = await apiCall<GroupView>(staff, 'POST', `${coursePath}/groups`, { name: 'Grupi A' });
  const lab = await apiCall<LabView>(staff, 'POST', `${coursePath}/labs`, { n: 1, title: 'Algoritmet e renditjes' });
  const labPath = `${coursePath}/labs/${lab.id}`;
  if (open) {
    await apiCall(staff, 'PUT', `${labPath}/access`, {
      groupId: null,
      visibleFrom: new Date(Date.now() - 60_000).toISOString(),
      visibleUntil: null,
      solutionsFrom: null,
    });
  }
  return { course, group, lab, labPath, pageUrl: `/o/e2e/courses/${course.id}/labs/${lab.id}` };
}

/** Uploads a converted notebook through the API, in the same steps as the app. */
export async function uploadNotebook(
  staff: Page,
  labPath: string,
  notebook: {
    kind: NotebookKind;
    title: string;
    raw: string;
    stored: StoredNotebook;
    assets?: Map<string, Uint8Array>;
  },
) {
  const created = await apiCall<NotebookSummary>(staff, 'POST', `${labPath}/notebooks`, {
    kind: notebook.kind,
    title: notebook.title,
    originalName: `${notebook.title}.ipynb`,
    sha256: createHash('sha256').update(notebook.raw).digest('hex'),
  });
  const files = `${labPath}/notebooks/${created.id}/files`;
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
  await apiCall(staff, 'POST', `${labPath}/notebooks/${created.id}/ready`);
  return created;
}

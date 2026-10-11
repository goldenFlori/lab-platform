import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { detectExercises } from '../../src/notebook/exercises.ts';
import { searchSections } from '../../src/notebook/search.ts';
import type { StoredNotebook } from '../../src/notebook/stored.ts';
import type { CourseSummary } from '../../src/shared/courses.ts';
import type { LabList, LabView } from '../../src/shared/labs.ts';
import { MAX_FILE_BYTES, ORIGINAL_FILE, RENDERED_FILE } from '../../src/shared/notebook-files.ts';
import type { Embed, NotebookDetail, NotebookKind, NotebookSummary } from '../../src/shared/notebooks.ts';
import type { PlannedLab } from './plan.ts';

// Puts a planned course on the platform through its API, as a signed-in pedagog would: the same
// permission checks and the same upload steps as the app. Running it again changes only what
// changed in the course repo; labs stay hidden until the pedagog opens them.

/** A request to the platform's API (`path` is under /api), signed in as the importing pedagog. */
export type Api = (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>;

export async function call<T = unknown>(api: Api, method: string, path: string, body?: unknown): Promise<T> {
  const res = await api(method, path, body);
  if (!res.ok) throw new Error(`${method} /api${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const MIME: Record<string, string> = { png: 'image/png', svg: 'image/svg+xml', json: 'application/json' };
const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

/** Uploads a converted notebook in the app's steps: create it, send each file, mark it ready. */
export async function uploadNotebook(
  api: Api,
  labPath: string,
  notebook: {
    kind: NotebookKind;
    title: string;
    originalName: string;
    raw: string;
    stored: StoredNotebook;
    assets?: Map<string, Uint8Array>;
  },
) {
  const files: { name: string; body: Uint8Array; type: string; gzip: boolean }[] = [
    {
      name: ORIGINAL_FILE,
      body: new TextEncoder().encode(notebook.raw),
      type: 'application/x-ipynb+json',
      gzip: false,
    },
    {
      name: RENDERED_FILE,
      body: gzipSync(JSON.stringify(notebook.stored)),
      type: 'application/json',
      gzip: true,
    },
  ];
  for (const [name, data] of notebook.assets ?? []) {
    const type = MIME[name.split('.').pop() ?? ''];
    if (!type) continue;
    // Plotly figures are JSON and shrink about tenfold; images are already compressed.
    const json = type === 'application/json';
    files.push({ name, body: json ? gzipSync(data) : data, type, gzip: json });
  }
  const tooBig = files.find((f) => f.body.byteLength > MAX_FILE_BYTES);
  if (tooBig) throw new Error(`${notebook.originalName}: ${tooBig.name} is larger than the platform takes`);

  const created = await call<NotebookSummary>(api, 'POST', `${labPath}/notebooks`, {
    kind: notebook.kind,
    title: notebook.title,
    originalName: notebook.originalName,
    sha256: sha256(notebook.raw),
  });
  const path = `${labPath}/notebooks/${created.id}`;
  for (const file of files) {
    const res = await api('PUT', `${path}/files/${encodeURIComponent(file.name)}`, file.body, {
      'Content-Type': file.type,
      ...(file.gzip ? { 'X-Content-Encoding': 'gzip' } : {}),
    });
    if (!res.ok) throw new Error(`PUT ${file.name} of ${notebook.originalName}: ${res.status} ${await res.text()}`);
  }
  await call(api, 'PUT', `${path}/search`, { sections: searchSections(notebook.stored) });
  const exercises = detectExercises(notebook.stored);
  if (exercises.length) await call(api, 'PUT', `${path}/exercises`, { exercises });
  await call(api, 'POST', `${path}/ready`);
  return created;
}

export type ImportReport = {
  course: CourseSummary;
  created: boolean;
  labs: { lab: LabView; change: 'created' | 'updated' | 'unchanged'; notebooks: NotebookSummary[] }[];
};

/**
 * Imports `labs` into the organization's current course with this title and year, creating it if
 * needed. A lab is found by its number; its imported notebooks by their file names. When any of a
 * lab's notebooks changed, all of them go up again, in the course's order. Notebooks added in the
 * app stay as they are.
 */
export async function importCourse(
  api: Api,
  { org, title, academicYear, labs }: { org: string; title: string; academicYear: string; labs: PlannedLab[] },
): Promise<ImportReport> {
  const courses = await call<CourseSummary[]>(api, 'GET', `/orgs/${org}/courses`);
  let course = courses.find((c) => c.title === title && c.academicYear === academicYear && !c.archivedAt);
  const created = !course;
  course ??= await call<CourseSummary>(api, 'POST', `/orgs/${org}/courses`, { title, academicYear });
  const coursePath = `/orgs/${org}/courses/${course.id}`;
  const existingLabs = (await call<LabList>(api, 'GET', `${coursePath}/labs`)).labs;

  const report: ImportReport = { course, created, labs: [] };
  for (const planned of labs) {
    const fields = { n: planned.n, title: planned.title, week: planned.week, summary: planned.summary };
    const found = existingLabs.find((l) => l.n === planned.n);
    let lab = found ?? (await call<LabView>(api, 'POST', `${coursePath}/labs`, fields));
    let change: ImportReport['labs'][number]['change'] = found ? 'unchanged' : 'created';
    if (found && (found.title !== fields.title || found.week !== fields.week || found.summary !== fields.summary)) {
      lab = await call<LabView>(api, 'PATCH', `${coursePath}/labs/${found.id}`, fields);
      change = 'updated';
    }

    const labPath = `${coursePath}/labs/${lab.id}`;
    const names = new Set(planned.notebooks.map((nb) => nb.originalName));
    const { notebooks: present } = await call<{ notebooks: NotebookSummary[] }>(api, 'GET', `${labPath}/notebooks`);
    let ours = present.filter((nb) => names.has(nb.originalName)).sort((a, b) => a.position - b.position);
    const kept = await unchanged(api, labPath, ours, planned);
    if (!kept) {
      for (const nb of ours) await call(api, 'DELETE', `${labPath}/notebooks/${nb.id}`);
      ours = [];
      for (const nb of planned.notebooks) ours.push(await uploadNotebook(api, labPath, nb));
      if (change === 'unchanged') change = 'updated';
    }
    for (const [i, nb] of ours.entries()) {
      // Kept notebooks get their search index again, so those imported before search have one too.
      const stored = planned.notebooks[i]?.stored;
      if (kept && stored)
        await call(api, 'PUT', `${labPath}/notebooks/${nb.id}/search`, { sections: searchSections(stored) });
      const embeds: Embed[] = planned.notebooks[i]?.embeds ?? [];
      const current = await call<NotebookDetail>(api, 'GET', `${labPath}/notebooks/${nb.id}`);
      // Kept notebooks without exercises get the ones they check themselves (#51); a list staff
      // changed in the app stays as it is.
      const exercises = stored ? detectExercises(stored) : [];
      if (kept && current.exercises.length === 0 && exercises.length) {
        await call(api, 'PUT', `${labPath}/notebooks/${nb.id}/exercises`, { exercises });
        if (change === 'unchanged') change = 'updated';
      }
      if (JSON.stringify(current.embeds) === JSON.stringify(embeds)) continue;
      await call(api, 'PUT', `${labPath}/notebooks/${nb.id}/embeds`, { embeds });
      if (change === 'unchanged') change = 'updated';
    }
    report.labs.push({ lab, change, notebooks: ours });
  }
  return report;
}

/** Whether the lab already holds exactly the planned notebooks, in order, with the same files. */
async function unchanged(api: Api, labPath: string, ours: NotebookSummary[], planned: PlannedLab) {
  if (ours.length !== planned.notebooks.length) return false;
  for (const [i, nb] of ours.entries()) {
    const want = planned.notebooks[i];
    if (!want || !nb.ready || nb.originalName !== want.originalName || nb.kind !== want.kind || nb.title !== want.title)
      return false;
    const res = await api('GET', `${labPath}/notebooks/${nb.id}/files/${ORIGINAL_FILE}`);
    if (!res.ok || sha256(new Uint8Array(await res.arrayBuffer())) !== sha256(want.raw)) return false;
  }
  return true;
}

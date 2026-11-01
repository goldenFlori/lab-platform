import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { detectExercises } from '../../src/notebook/exercises.ts';
import { searchSections } from '../../src/notebook/search.ts';
import { type CellMatch, matchCells, notebookCells } from '../../src/notebook/versions.ts';
import type { CourseSummary } from '../../src/shared/courses.ts';
import type { LabList, LabView } from '../../src/shared/labs.ts';
import { MAX_FILE_BYTES, ORIGINAL_FILE, RENDERED_FILE, STAGED_PREFIX } from '../../src/shared/notebook-files.ts';
import type { CellWork, Embed, NotebookDetail, NotebookKind, NotebookSummary } from '../../src/shared/notebooks.ts';
import type { PlannedLab, PlannedNotebook } from './plan.ts';

// Puts a planned course on the platform through its API, as a signed-in pedagog would: the same
// permission checks and the same upload steps as the app. Running it again changes only what
// changed in the course repo; labs stay hidden until the pedagog opens them.
//
// A notebook that changed gets a new version in its place (#208, #209), never a delete and a fresh
// upload: students keep their code, answers, hand-ins and grades, moved with their cell. Everything is
// planned first, reading only; if a cell with students' work would be gone, nothing is changed and the
// report says where, unless the importer allows the loss.

/** A request to the platform's API (`path` is under /api), signed in as the importing pedagog. */
export type Api = (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>;

export async function call<T = unknown>(api: Api, method: string, path: string, body?: unknown): Promise<T> {
  const res = await api(method, path, body);
  if (!res.ok) throw new Error(`${method} /api${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const MIME: Record<string, string> = { png: 'image/png', svg: 'image/svg+xml', json: 'application/json' };
const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

type Converted = Pick<PlannedNotebook, 'originalName' | 'raw' | 'stored'> & { assets?: Map<string, Uint8Array> };

/** A converted notebook's files as they go up: the original, the rendering, its images and figures. */
function filesOf(notebook: Converted) {
  const files: { name: string; body: Uint8Array; type: string; gzip: boolean }[] = [
    {
      name: ORIGINAL_FILE,
      body: new TextEncoder().encode(notebook.raw),
      type: 'application/x-ipynb+json',
      gzip: false,
    },
    { name: RENDERED_FILE, body: gzipSync(JSON.stringify(notebook.stored)), type: 'application/json', gzip: true },
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
  return files;
}

async function sendFiles(api: Api, path: string, notebook: Converted, prefix = '') {
  for (const file of filesOf(notebook)) {
    const res = await api('PUT', `${path}/files/${encodeURIComponent(prefix + file.name)}`, file.body, {
      'Content-Type': file.type,
      ...(file.gzip ? { 'X-Content-Encoding': 'gzip' } : {}),
    });
    if (!res.ok) throw new Error(`PUT ${file.name} of ${notebook.originalName}: ${res.status} ${await res.text()}`);
  }
}

/** Uploads a converted notebook in the app's steps: create it, send each file, mark it ready. */
export async function uploadNotebook(
  api: Api,
  labPath: string,
  notebook: Converted & { kind: NotebookKind; title: string },
) {
  filesOf(notebook);
  const created = await call<NotebookSummary>(api, 'POST', `${labPath}/notebooks`, {
    kind: notebook.kind,
    title: notebook.title,
    originalName: notebook.originalName,
    sha256: sha256(notebook.raw),
  });
  const path = `${labPath}/notebooks/${created.id}`;
  await sendFiles(api, path, notebook);
  await call(api, 'PUT', `${path}/search`, { sections: searchSections(notebook.stored) });
  const exercises = detectExercises(notebook.stored);
  if (exercises.length) await call(api, 'PUT', `${path}/exercises`, { exercises });
  return call<NotebookDetail>(api, 'POST', `${path}/ready`);
}

/** A cell that a new version would remove while students have work in it. */
export type Loss = { lab: number; notebook: string; cell: number; firstLine: string; students: number };

/** What the import would do to a notebook already there, or would upload. */
type Step =
  | { action: 'upload'; want: PlannedNotebook }
  | { action: 'keep'; want: PlannedNotebook; nb: NotebookSummary }
  | { action: 'version'; want: PlannedNotebook; nb: NotebookSummary; match: CellMatch };

export type ImportReport = {
  course: CourseSummary;
  created: boolean;
  labs: {
    lab: LabView;
    change: 'created' | 'updated' | 'unchanged';
    notebooks: NotebookSummary[];
    /** Notebooks that got a new version, with how their cells changed. */
    versions: { originalName: string; changed: number; added: number; removed: number }[];
  }[];
};

/** The import stopped before changing anything: these cells hold students' work and would be gone. */
export class ImportBlocked extends Error {
  constructor(readonly losses: Loss[]) {
    super(
      `Stopped before changing anything: ${losses.length} cell${losses.length === 1 ? '' : 's'} with students' work would be gone`,
    );
  }
}

/**
 * Imports `labs` into the organization's current course with this title and year, creating it if
 * needed. A lab is found by its number; its imported notebooks by their file names. A notebook that
 * changed gets a new version in place; a new one is uploaded after the rest. Notebooks added in the
 * app stay as they are. With `allowLoss`, a cell with students' work may go.
 */
export async function importCourse(
  api: Api,
  {
    org,
    title,
    academicYear,
    labs,
    allowLoss = false,
  }: { org: string; title: string; academicYear: string; labs: PlannedLab[]; allowLoss?: boolean },
): Promise<ImportReport> {
  const courses = await call<CourseSummary[]>(api, 'GET', `/orgs/${org}/courses`);
  const found = courses.find((c) => c.title === title && c.academicYear === academicYear && !c.archivedAt);
  const coursePath = found ? `/orgs/${org}/courses/${found.id}` : null;
  const existingLabs = coursePath ? (await call<LabList>(api, 'GET', `${coursePath}/labs`)).labs : [];

  // First, only reading: what each notebook needs, and what a new version would take away.
  const plans: { planned: PlannedLab; lab: LabView | undefined; steps: Step[] }[] = [];
  const losses: Loss[] = [];
  for (const planned of labs) {
    const lab = existingLabs.find((l) => l.n === planned.n);
    const present =
      coursePath && lab
        ? (await call<{ notebooks: NotebookSummary[] }>(api, 'GET', `${coursePath}/labs/${lab.id}/notebooks`)).notebooks
        : [];
    const steps: Step[] = [];
    for (const want of planned.notebooks) {
      const nb = present.find((n) => n.originalName === want.originalName && n.ready);
      if (!nb || !lab || !coursePath) {
        steps.push({ action: 'upload', want });
        continue;
      }
      const path = `${coursePath}/labs/${lab.id}/notebooks/${nb.id}`;
      const res = await api('GET', `${path}/files/${ORIGINAL_FILE}?v=${nb.version}`);
      if (!res.ok) throw new Error(`GET the original of ${want.originalName}: ${res.status}`);
      const before = await res.text();
      if (sha256(before) === sha256(want.raw)) {
        steps.push({ action: 'keep', want, nb });
        continue;
      }
      const oldCells = notebookCells(before);
      const match = matchCells(oldCells, notebookCells(want.raw));
      const { cells: work } = await call<{ cells: CellWork[] }>(api, 'GET', `${path}/cells/work`);
      for (const cell of match.removed) {
        const students = work.find((w) => w.cell === cell)?.students ?? 0;
        if (students === 0) continue;
        const firstLine = oldCells[cell]?.source.split('\n').find((l) => l.trim()) ?? '';
        losses.push({ lab: planned.n, notebook: want.originalName, cell, firstLine, students });
      }
      steps.push({ action: 'version', want, nb, match });
    }
    plans.push({ planned, lab, steps });
  }
  if (losses.length && !allowLoss) throw new ImportBlocked(losses);

  // Then the changes.
  const course = found ?? (await call<CourseSummary>(api, 'POST', `/orgs/${org}/courses`, { title, academicYear }));
  const base = `/orgs/${org}/courses/${course.id}`;
  const report: ImportReport = { course, created: !found, labs: [] };
  for (const { planned, lab: existing, steps } of plans) {
    const fields = { n: planned.n, title: planned.title, week: planned.week, summary: planned.summary };
    let lab = existing ?? (await call<LabView>(api, 'POST', `${base}/labs`, fields));
    let change: ImportReport['labs'][number]['change'] = existing ? 'unchanged' : 'created';
    if (
      existing &&
      (existing.title !== fields.title || existing.week !== fields.week || existing.summary !== fields.summary)
    ) {
      lab = await call<LabView>(api, 'PATCH', `${base}/labs/${existing.id}`, fields);
      change = 'updated';
    }
    const labPath = `${base}/labs/${lab.id}`;
    const notebooks: NotebookSummary[] = [];
    const versions: ImportReport['labs'][number]['versions'] = [];
    for (const step of steps) {
      const { want } = step;
      let nb: NotebookSummary;
      if (step.action === 'upload') {
        nb = await uploadNotebook(api, labPath, want);
        if (change === 'unchanged') change = 'updated';
      } else if (step.action === 'version') {
        nb = await putVersion(api, `${labPath}/notebooks/${step.nb.id}`, want, step.match);
        versions.push({
          originalName: want.originalName,
          changed: step.match.changed.length,
          added: step.match.added.length,
          removed: step.match.removed.length,
        });
        if (change === 'unchanged') change = 'updated';
      } else {
        nb = step.nb;
        // Kept notebooks get their search index again, so those imported before search have one too.
        await call(api, 'PUT', `${labPath}/notebooks/${nb.id}/search`, { sections: searchSections(want.stored) });
      }
      const path = `${labPath}/notebooks/${nb.id}`;
      const current = await call<NotebookDetail>(api, 'GET', path);
      // Kept notebooks without exercises get the ones they check themselves (#51); a list staff
      // changed in the app stays as it is.
      const exercises = detectExercises(want.stored);
      if (step.action === 'keep' && current.exercises.length === 0 && exercises.length) {
        await call(api, 'PUT', `${path}/exercises`, { exercises });
        if (change === 'unchanged') change = 'updated';
      }
      const embeds = withSeeds(want.embeds, current.embeds);
      if (JSON.stringify(current.embeds) !== JSON.stringify(embeds)) {
        await call(api, 'PUT', `${path}/embeds`, { embeds });
        if (change === 'unchanged') change = 'updated';
      }
      notebooks.push(nb);
    }
    report.labs.push({ lab, change, notebooks, versions });
  }
  return report;
}

/**
 * A new version in place of a notebook, as the app puts one (#208): files staged, cells moved, then its
 * search index and the exercises it checks itself in new or changed cells.
 */
async function putVersion(api: Api, path: string, want: PlannedNotebook, match: CellMatch) {
  await sendFiles(api, path, want, STAGED_PREFIX);
  const changed = match.changed.map(([, n]) => n);
  const updated = await call<NotebookDetail>(api, 'POST', `${path}/version`, {
    map: match.map,
    changed,
    originalName: want.originalName,
    sha256: sha256(want.raw),
  });
  await call(api, 'PUT', `${path}/search`, { sections: searchSections(want.stored) });
  const fresh = new Set([...match.added, ...changed]);
  const taken = new Set(updated.exercises.map((x) => x.cell));
  const found = detectExercises(want.stored).filter((x) => fresh.has(x.cell) && !taken.has(x.cell));
  if (found.length) {
    const exercises = [...updated.exercises, ...found].sort((a, b) => a.cell - b.cell);
    await call(api, 'PUT', `${path}/exercises`, { exercises });
  }
  return updated;
}

/** The course's embeds, keeping the cell a variant's graphs come from where one is pinned (#208). */
function withSeeds(planned: Embed[], current: Embed[]): Embed[] {
  return planned.map((embed) => {
    const now = current.find((e) => e.cell === embed.cell && e.viz === embed.viz);
    const seedCell = now?.props?.seedCell;
    if (typeof seedCell !== 'number' || embed.props?.seedCell !== undefined) return embed;
    return { ...embed, props: { ...(embed.props ?? {}), seedCell } };
  });
}

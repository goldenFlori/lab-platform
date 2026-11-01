import { type StoredNotebook, toStored } from '../../notebook/stored';
import type { CellMatch } from '../../notebook/versions';
import type { ApiErrorBody } from '../../shared/auth';
import { MAX_FILE_BYTES, ORIGINAL_FILE, RENDERED_FILE, STAGED_PREFIX } from '../../shared/notebook-files';
import type { CellWork, NotebookDetail, NotebookKind, NotebookSummary } from '../../shared/notebooks';
import { t } from '../i18n';
import { ApiError, api } from './api';

// A notebook goes up the way the Worker can take it: converted here, in the pedagog's browser, then
// sent in steps (create, each file, ready). The Worker never parses a notebook.

export type UploadProgress =
  | { phase: 'converting' }
  | { phase: 'uploading'; done: number; total: number }
  | { phase: 'finishing' };

/** Why an upload stopped, in words for the pedagog. */
export class UploadError extends Error {}

const MIME: Record<string, string> = { png: 'image/png', svg: 'image/svg+xml', json: 'application/json' };

async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function sha256(data: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function putFile(path: string, name: string, body: Uint8Array, type: string, gzipped: boolean) {
  let res: Response;
  try {
    res = await fetch(`/api${path}/files/${encodeURIComponent(name)}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': type, ...(gzipped ? { 'X-Content-Encoding': 'gzip' } : {}) },
      body: body as BodyInit,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (!res.ok) {
    const error = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, error?.error ?? 'internal');
  }
}

/** A notebook converted in this browser, ready to send: its files, cells and fingerprint. */
export type PreparedNotebook = {
  name: string;
  raw: string;
  stored: StoredNotebook;
  sha256: string;
  files: { name: string; body: Uint8Array; type: string; gzipped: boolean }[];
};

/** Converts an .ipynb here and lists the files that go up, refusing one too large. */
async function prepareNotebook(file: File): Promise<PreparedNotebook> {
  const original = new Uint8Array(await file.arrayBuffer());
  const raw = new TextDecoder().decode(original);
  // The converter is large (Shiki, KaTeX, WebAssembly), so it loads only for an upload.
  const { renderNotebook } = await import('../../notebook');
  const assets = new Map<string, Uint8Array>();
  let stored: StoredNotebook;
  try {
    stored = toStored(await renderNotebook(raw, { assets }));
  } catch {
    throw new UploadError(t().upload.invalid);
  }

  const files: PreparedNotebook['files'] = [
    { name: ORIGINAL_FILE, body: original, type: 'application/x-ipynb+json', gzipped: false },
    {
      name: RENDERED_FILE,
      body: await gzip(new TextEncoder().encode(JSON.stringify(stored))),
      type: 'application/json',
      gzipped: true,
    },
  ];
  for (const [name, data] of assets) {
    const type = MIME[name.split('.').pop() ?? ''];
    if (!type) continue;
    // Plotly figures are JSON and shrink about tenfold; images are already compressed.
    const json = type === 'application/json';
    files.push({ name, body: json ? await gzip(data) : data, type, gzipped: json });
  }
  const tooBig = files.find((f) => f.body.byteLength > MAX_FILE_BYTES);
  if (tooBig) {
    throw new UploadError(t().upload.fileTooLarge(MAX_FILE_BYTES / 1024 / 1024, tooBig.name));
  }
  return { name: file.name, raw, stored, sha256: await sha256(original), files };
}

/** Sends a prepared notebook's files, each under `prefix` + its name. */
async function sendFiles(
  path: string,
  prepared: PreparedNotebook,
  prefix: string,
  onProgress: (progress: UploadProgress) => void,
) {
  for (const [i, f] of prepared.files.entries()) {
    onProgress({ phase: 'uploading', done: i, total: prepared.files.length });
    await putFile(path, prefix + f.name, f.body, f.type, f.gzipped);
  }
}

/**
 * Converts and uploads one notebook into a lab (`base` is the lab's notebooks path). If it stops
 * part-way, the notebook stays unfinished: staff see it marked so and can delete it.
 */
export async function uploadNotebook(
  base: string,
  file: File,
  { kind, title }: { kind: NotebookKind; title: string },
  onProgress: (progress: UploadProgress) => void,
): Promise<NotebookDetail> {
  onProgress({ phase: 'converting' });
  const prepared = await prepareNotebook(file);
  const created = await api<NotebookSummary>(base, {
    method: 'POST',
    body: {
      kind,
      title: (title.trim() || prepared.stored.title || file.name.replace(/\.ipynb$/i, '')).slice(0, 160),
      originalName: file.name.slice(0, 200),
      sha256: prepared.sha256,
    },
  });
  const path = `${base}/${encodeURIComponent(created.id)}`;
  await sendFiles(path, prepared, '', onProgress);
  onProgress({ phase: 'finishing' });
  // Its search index (#17) and the exercises it checks itself (#51), made here like the rest.
  const [{ searchSections }, { detectExercises }] = await Promise.all([
    import('../../notebook/search'),
    import('../../notebook/exercises'),
  ]);
  await api(`${path}/search`, { method: 'PUT', body: { sections: searchSections(prepared.stored) } });
  const exercises = detectExercises(prepared.stored);
  if (exercises.length) await api(`${path}/exercises`, { method: 'PUT', body: { exercises } });
  return api<NotebookDetail>(`${path}/ready`, { method: 'POST' });
}

/* ------------------------------------------------------------ a new version (#208) */

/** A new version compared with the notebook in place: how its cells match, and the work in each. */
export type VersionPlan = {
  prepared: PreparedNotebook;
  match: CellMatch;
  /** The old version's cells, to name a cell to staff by its first line. */
  before: { type: string; source: string }[];
  work: CellWork[];
};

/** Converts the new version here and matches its cells with the version in place. */
export async function planVersion(base: string, notebook: NotebookSummary, file: File): Promise<VersionPlan> {
  const path = `${base}/${encodeURIComponent(notebook.id)}`;
  const [prepared, oldRaw, { cells: work }, { matchCells, notebookCells }] = await Promise.all([
    prepareNotebook(file),
    fetch(`/api${path}/files/${ORIGINAL_FILE}?v=${notebook.version}`, { credentials: 'same-origin' }).then((res) => {
      if (!res.ok) throw new ApiError(res.status, 'internal');
      return res.text();
    }),
    api<{ cells: CellWork[] }>(`${path}/cells/work`),
    import('../../notebook/versions'),
  ]);
  let before: VersionPlan['before'];
  let after: VersionPlan['before'];
  try {
    before = notebookCells(oldRaw);
    after = notebookCells(prepared.raw);
  } catch {
    throw new UploadError(t().upload.invalid);
  }
  return { prepared, match: matchCells(before, after), before, work };
}

/**
 * Puts the planned version in place: its files staged, then everything kept by cell moved at once,
 * then its search index, and the exercises it checks itself in new or changed cells (staff's own
 * list, moved with its cells, stays as it is).
 */
export async function publishVersion(
  base: string,
  notebook: NotebookDetail,
  plan: VersionPlan,
  onProgress: (progress: UploadProgress) => void,
): Promise<NotebookDetail> {
  const path = `${base}/${encodeURIComponent(notebook.id)}`;
  await sendFiles(path, plan.prepared, STAGED_PREFIX, onProgress);
  onProgress({ phase: 'finishing' });
  const changed = plan.match.changed.map(([, n]) => n);
  const updated = await api<NotebookDetail>(`${path}/version`, {
    method: 'POST',
    body: {
      map: plan.match.map,
      changed,
      originalName: plan.prepared.name.slice(0, 200),
      sha256: plan.prepared.sha256,
    },
  });
  const [{ searchSections }, { detectExercises }] = await Promise.all([
    import('../../notebook/search'),
    import('../../notebook/exercises'),
  ]);
  await api(`${path}/search`, { method: 'PUT', body: { sections: searchSections(plan.prepared.stored) } });
  const fresh = new Set([...plan.match.added, ...changed]);
  const taken = new Set(updated.exercises.map((x) => x.cell));
  const found = detectExercises(plan.prepared.stored).filter((x) => fresh.has(x.cell) && !taken.has(x.cell));
  if (found.length === 0) return updated;
  const exercises = [...updated.exercises, ...found].sort((a, b) => a.cell - b.cell);
  await api(`${path}/exercises`, { method: 'PUT', body: { exercises } });
  return { ...updated, exercises };
}

import { toStored } from '../../notebook/stored';
import type { ApiErrorBody } from '../../shared/auth';
import { MAX_FILE_BYTES, ORIGINAL_FILE, RENDERED_FILE } from '../../shared/notebook-files';
import type { NotebookDetail, NotebookKind, NotebookSummary } from '../../shared/notebooks';
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
  const original = new Uint8Array(await file.arrayBuffer());
  const raw = new TextDecoder().decode(original);
  // The converter is large (Shiki, KaTeX, WebAssembly), so it loads only for an upload.
  const { renderNotebook } = await import('../../notebook');
  const assets = new Map<string, Uint8Array>();
  let stored: ReturnType<typeof toStored>;
  try {
    stored = toStored(await renderNotebook(raw, { assets }));
  } catch {
    throw new UploadError(t().upload.invalid);
  }

  const files: { name: string; body: Uint8Array; type: string; gzipped: boolean }[] = [
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

  const created = await api<NotebookSummary>(base, {
    method: 'POST',
    body: {
      kind,
      title: (title.trim() || stored.title || file.name.replace(/\.ipynb$/i, '')).slice(0, 160),
      originalName: file.name.slice(0, 200),
      sha256: await sha256(original),
    },
  });
  const path = `${base}/${encodeURIComponent(created.id)}`;
  for (const [i, f] of files.entries()) {
    onProgress({ phase: 'uploading', done: i, total: files.length });
    await putFile(path, f.name, f.body, f.type, f.gzipped);
  }
  onProgress({ phase: 'finishing' });
  // Its search index (#17), made here like the rest.
  const { searchSections } = await import('../../notebook/search');
  await api(`${path}/search`, { method: 'PUT', body: { sections: searchSections(stored) } });
  return api<NotebookDetail>(`${path}/ready`, { method: 'POST' });
}

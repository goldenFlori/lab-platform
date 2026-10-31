import type { Branding } from '../../shared/branding';
import {
  EXPORT_FORMAT,
  EXPORT_PARTS,
  type ExportPage,
  type ExportPart,
  type OrganizationExport,
} from '../../shared/org-export';
import { api } from './api';

// An institution's data for its admin (#117): every page of every part, then each notebook's
// original, gathered here in the browser so the Worker only ever serves small pages.

export type ExportProgress = { step: number; of: number };

export async function exportOrganization(
  organization: OrganizationExport['organization'],
  onProgress: (progress: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<OrganizationExport> {
  const base = `/orgs/${encodeURIComponent(organization.slug)}/export`;
  const tables = {} as Record<ExportPart, Record<string, unknown>[]>;
  const of = EXPORT_PARTS.length + 1;
  for (const [step, part] of EXPORT_PARTS.entries()) {
    onProgress({ step, of });
    const rows: Record<string, unknown>[] = [];
    let after = '';
    for (;;) {
      signal?.throwIfAborted();
      const page = await api<ExportPage>(`${base}/${part}?after=${encodeURIComponent(after)}`);
      rows.push(...page.rows);
      if (!page.next) break;
      after = page.next;
    }
    tables[part] = rows;
  }

  onProgress({ step: EXPORT_PARTS.length, of });
  const notebookFiles: Record<string, unknown> = {};
  for (const nb of tables.notebooks) {
    signal?.throwIfAborted();
    const id = String(nb.id);
    const res = await fetch(`/api${base}/notebooks/${encodeURIComponent(id)}`, { credentials: 'same-origin', signal });
    // A notebook still being uploaded has no original yet.
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`Notebook ${id}: ${res.status}`);
    notebookFiles[id] = await res.json();
  }
  return {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    organization,
    branding: await brandingOf(organization.slug, signal),
    tables,
    notebookFiles,
  };
}

/** The institution's accent and logo (#201), the logo as base64 so the file holds it whole. */
async function brandingOf(slug: string, signal?: AbortSignal): Promise<OrganizationExport['branding']> {
  const branding = await api<Branding>(`/orgs/${encodeURIComponent(slug)}/branding`);
  if (!branding.logo) return { accent: branding.accent, logo: null };
  const res = await fetch(branding.logo, { credentials: 'same-origin', signal });
  if (!res.ok) throw new Error(`Logo: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return {
    accent: branding.accent,
    logo: { type: res.headers.get('Content-Type') ?? 'application/octet-stream', base64: btoa(binary) },
  };
}

export function downloadExport(data: OrganizationExport) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${data.organization.slug}-${data.exportedAt.slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src/api/db/tenant';
import type { NotebookDetail, NotebookSummary } from '../../src/shared/notebooks';
import { seedOrganization } from './fixtures';
import { account } from './http';

const json = async <T>(res: Response) => (await res.json()) as T;
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
const later = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

async function gzip(text: string) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const RENDERED = JSON.stringify({
  title: 'Grafet',
  cells: [{ type: 'markdown', html: '<p>Përshëndetje</p>', srcIndex: 0 }],
});

async function setup() {
  const seed = await seedOrganization('fshn');
  const groupB = await seed.tenant.groups.create({ courseId: seed.course.id, name: 'Grupi B' });
  const pedagog = await account(seed, 'pedagog', { courseId: seed.course.id });
  const assistant = await account(seed, 'assistant', { groupId: seed.group.id });
  const student = await account(seed, 'student', { groupId: groupB.id });
  const lab = `/orgs/${seed.org.slug}/courses/${seed.course.id}/labs/${seed.lab.id}`;
  const notebooks = `${lab}/notebooks`;
  const open = (r: Record<string, string | null> = {}) =>
    pedagog.call(`${lab}/access`, {
      method: 'PUT',
      body: { groupId: null, visibleFrom: ago(60), visibleUntil: null, solutionsFrom: null, ...r },
    });

  /** The browser's upload: create, then each file, then ready. */
  async function upload(kind: 'main' | 'extra' | 'solution' = 'main', image = new Uint8Array([137, 80, 78, 71])) {
    const created = await pedagog.call(notebooks, {
      method: 'POST',
      body: { kind, title: `Laboratori 4 (${kind})`, originalName: 'laborator 04.ipynb', sha256: 'a'.repeat(64) },
    });
    const nb = await json<NotebookSummary>(created);
    const put = (name: string, raw: Uint8Array | string, type: string, gzipped = false) =>
      pedagog.call(`${notebooks}/${nb.id}/files/${name}`, {
        method: 'PUT',
        raw,
        headers: { 'Content-Type': type, ...(gzipped ? { 'X-Content-Encoding': 'gzip' } : {}) },
      });
    expect((await put('notebook.ipynb', '{"cells": []}', 'application/x-ipynb+json')).status).toBe(204);
    expect((await put('rendered.json', await gzip(RENDERED), 'application/json', true)).status).toBe(204);
    expect((await put('img-0123456789ab.png', image, 'image/png')).status).toBe(204);
    return { nb, put, ready: () => pedagog.call(`${notebooks}/${nb.id}/ready`, { method: 'POST' }) };
  }

  return { seed, pedagog, assistant, student, lab, notebooks, open, upload };
}

describe('uploading and reading notebooks', () => {
  it('stores the files in chunks and serves them to students of an open lab, gzip as it is', async () => {
    const { student, notebooks, open, upload } = await setup();
    await open();
    // 1.2 MB of noise: stored as three chunks of at most 512 KB.
    const big = new Uint8Array(1_200_000);
    for (let i = 0; i < big.length; i += 65_536) crypto.getRandomValues(big.subarray(i, i + 65_536));
    const { nb, ready } = await upload('main', big);
    expect((await ready()).status).toBe(200);

    const list = await json<{ notebooks: NotebookSummary[] }>(await student.call(notebooks));
    expect(list.notebooks.map((n) => n.title)).toContain('Laboratori 4 (main)');

    const rendered = await student.call(`${notebooks}/${nb.id}/files/rendered.json`, {
      headers: { 'Accept-Encoding': 'gzip, br' },
    });
    expect(rendered.status).toBe(200);
    expect(rendered.headers.get('Content-Encoding')).toBe('gzip');
    expect(rendered.headers.get('Content-Type')).toBe('application/json');
    // Sent gzipped as stored; fetch (like a browser) unpacks it on arrival.
    expect(await rendered.text()).toBe(RENDERED);

    const plain = await student.call(`${notebooks}/${nb.id}/files/rendered.json`, {
      headers: { 'Accept-Encoding': 'identity' },
    });
    expect(plain.headers.get('Content-Encoding')).toBeNull();
    expect(await plain.text()).toBe(RENDERED);

    const asset = await student.call(`${notebooks}/${nb.id}/files/img-0123456789ab.png`);
    expect(new Uint8Array(await asset.arrayBuffer())).toEqual(big);
    const { results } = await env.DB.prepare(
      "select f.chunk_count from files f where f.notebook_id = ? and f.name = 'img-0123456789ab.png'",
    )
      .bind(nb.id)
      .all();
    expect(results[0]?.chunk_count).toBe(3);
  });

  it('never lets a file run code on the site, and downloads the original as an attachment', async () => {
    const { student, notebooks, open, upload } = await setup();
    await open();
    const { nb, ready } = await upload();
    await ready();
    const asset = await student.call(`${notebooks}/${nb.id}/files/img-0123456789ab.png`);
    expect(asset.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(asset.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect(asset.headers.get('Cache-Control')).toContain('private');
    const original = await student.call(`${notebooks}/${nb.id}/files/notebook.ipynb`);
    expect(original.headers.get('Content-Disposition')).toBe(
      'attachment; filename="laborator_04.ipynb"; filename*=UTF-8\'\'laborator%2004.ipynb',
    );
  });

  it('hides a notebook from students until its upload is finished, and needs both main files first', async () => {
    const { pedagog, student, notebooks, open, upload } = await setup();
    await open();
    const created = await pedagog.call(notebooks, {
      method: 'POST',
      body: { kind: 'main', title: 'Pa skedarë', originalName: 'x.ipynb', sha256: 'b'.repeat(64) },
    });
    const empty = await json<NotebookSummary>(created);
    expect((await pedagog.call(`${notebooks}/${empty.id}/ready`, { method: 'POST' })).status).toBe(409);

    const { nb, ready } = await upload();
    expect((await student.call(`${notebooks}/${nb.id}`)).status).toBe(404);
    const staff = await json<{ notebooks: NotebookSummary[] }>(await pedagog.call(notebooks));
    expect(staff.notebooks.find((n) => n.id === nb.id)?.ready).toBe(false);
    await ready();
    expect((await student.call(`${notebooks}/${nb.id}`)).status).toBe(200);
  });

  it('follows the lab: nothing for students while it is hidden', async () => {
    const { student, notebooks, upload } = await setup();
    const { nb, ready } = await upload();
    await ready();
    expect((await student.call(notebooks)).status).toBe(404);
    expect((await student.call(`${notebooks}/${nb.id}/files/rendered.json`)).status).toBe(404);
  });

  it('shows a solution notebook to students only once solutions are open, and to staff always', async () => {
    const { student, assistant, notebooks, open, upload } = await setup();
    await open({ solutionsFrom: later(3600) });
    const { nb, ready } = await upload('solution');
    await ready();
    expect((await student.call(`${notebooks}/${nb.id}`)).status).toBe(404);
    expect((await assistant.call(`${notebooks}/${nb.id}`)).status).toBe(200);
    await open({ solutionsFrom: ago(1) });
    expect((await student.call(`${notebooks}/${nb.id}`)).status).toBe(200);
  });
});

describe('managing notebooks', () => {
  it('lets only course managers upload, and refuses unsafe names, types and sizes', async () => {
    const { assistant, student, notebooks, open, upload } = await setup();
    await open();
    const body = { kind: 'main', title: 'X', originalName: 'x.ipynb', sha256: 'c'.repeat(64) };
    expect((await assistant.call(notebooks, { method: 'POST', body })).status).toBe(403);
    expect((await student.call(notebooks, { method: 'POST', body })).status).toBe(403);

    const { put } = await upload();
    expect((await put('.hidden', 'x', 'application/json')).status).toBe(400);
    expect((await put('page.html', '<script>steal()</script>', 'text/html')).status).toBe(400);
    expect((await put('big.json', new Uint8Array(10 * 1024 * 1024 + 1), 'application/json')).status).toBe(413);
  });

  it('keeps one visualization per cell, from the known list, and replaces them all at once', async () => {
    const { seed, pedagog, notebooks } = await setup();
    const url = `${notebooks}/${seed.notebook.id}/embeds`;
    const set = (embeds: unknown[]) => pedagog.call(url, { method: 'PUT', body: { embeds } });

    const res = await set([
      { cell: 9, viz: 'rruget', title: 'GPS', props: { preset: 'shqiperia' } },
      { cell: 3, viz: 'renditja' },
    ]);
    expect(res.status).toBe(200);
    expect((await json<NotebookDetail>(res)).embeds).toEqual([
      { cell: 3, viz: 'renditja', title: null, props: null },
      { cell: 9, viz: 'rruget', title: 'GPS', props: { preset: 'shqiperia' } },
    ]);
    expect((await set([{ cell: 1, viz: 'teleport' }])).status).toBe(400);
    expect(
      (
        await set([
          { cell: 1, viz: 'grafet' },
          { cell: 1, viz: 'rruget' },
        ])
      ).status,
    ).toBe(400);
  });

  it('removes a notebook with its files, chunks and embeds', async () => {
    const { pedagog, notebooks, open, upload } = await setup();
    await open();
    const { nb, ready } = await upload();
    await ready();
    expect((await pedagog.call(`${notebooks}/${nb.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await pedagog.call(`${notebooks}/${nb.id}/files/rendered.json`)).status).toBe(404);
    const { results } = await env.DB.prepare(
      'select count(*) as n from file_chunks c join files f on f.id = c.file_id where f.notebook_id = ?',
    )
      .bind(nb.id)
      .all();
    expect(results[0]?.n).toBe(0);
  });
});

describe('cross-tenant isolation: notebook files and embeds', () => {
  it("cannot read, write or attach to another organization's notebook", async () => {
    const a = await seedOrganization('a');
    const b = await seedOrganization('b');
    await b.tenant.notebooks.putFile(b.notebook.id, 'rendered.json', {
      mime: 'application/json',
      encoding: 'identity',
      data: new TextEncoder().encode('{}'),
    });
    expect(await a.tenant.notebooks.getFile(b.notebook.id, 'rendered.json')).toBeUndefined();
    expect(await a.tenant.notebooks.embedsOf(b.notebook.id)).toEqual([]);
    await expect(
      a.tenant.notebooks.putFile(b.notebook.id, 'x.json', {
        mime: 'application/json',
        encoding: 'identity',
        data: new Uint8Array([1]),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      a.tenant.notebooks.setEmbeds(b.notebook.id, [{ cell: 1, viz: 'grafet', title: null, props: null }]),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await b.tenant.notebooks.embedsOf(b.notebook.id)).toHaveLength(1);
  });
});

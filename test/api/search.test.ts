import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createDb } from '../../src/api/db';
import { uuidv7 } from '../../src/api/db/ids';
import { searchSections } from '../../src/api/db/schema';
import { NotFoundError, ROWS_PER_INSERT } from '../../src/api/db/tenant';
import type { SearchIndex } from '../../src/shared/search';
import { MAX_SECTIONS } from '../../src/shared/search-limits';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #17 is done when a student never sees search results from a hidden lab. Each notebook's index
// holds a word found nowhere else, so a leak shows up anywhere in the response.

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
const later = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
const section = (word: string) => ({ anchor: word.toLowerCase(), title: `Seksioni ${word}`, text: word, keywords: '' });

async function setup() {
  const seed = await seedOrganization('fshn');
  const { tenant, course } = seed;
  const groupB = await tenant.groups.create({ courseId: course.id, name: 'Grupi B' });
  const pedagog = await account(seed, 'pedagog', { courseId: course.id });
  const student = await account(seed, 'student', { groupId: groupB.id });
  const coursePath = `/orgs/${seed.org.slug}/courses/${course.id}`;

  // The seed's lab is hidden from group B; lab 2 has a main notebook, a solution and an unfinished one.
  const lab2 = await tenant.labs.create({ courseId: course.id, n: 2, title: 'Renditja', position: 2 });
  const notebook = (kind: 'main' | 'solution', readyAt: Date | null = new Date()) =>
    tenant.notebooks.create({
      labId: lab2.id,
      kind,
      title: kind,
      position: 1,
      originalName: `${kind}.ipynb`,
      sha256: '0'.repeat(64),
      readyAt,
    });
  const [main, solution, unfinished] = [
    await notebook('main'),
    await notebook('solution'),
    await notebook('main', null),
  ];
  await tenant.notebooks.setSearchSections(seed.notebook.id, [section('FSHEHUR')]);
  await tenant.notebooks.setSearchSections(main.id, [section('HAPUR'), section('MERGE')]);
  await tenant.notebooks.setSearchSections(solution.id, [section('ZGJIDHJA')]);
  await tenant.notebooks.setSearchSections(unfinished.id, [section('PAPERFUNDUAR')]);

  const rule = (labId: string, r: Record<string, string | null>) =>
    pedagog.call(`${coursePath}/labs/${labId}/access`, {
      method: 'PUT',
      body: { groupId: null, visibleFrom: null, visibleUntil: null, solutionsFrom: null, ...r },
    });
  const search = async (who: { call: typeof pedagog.call }) => {
    const res = await who.call(`${coursePath}/search`);
    return { status: res.status, text: await res.text() };
  };
  return { seed, pedagog, student, coursePath, lab2, main, solution, rule, search };
}

describe('search over permitted content', () => {
  it('gives a student only the labs open to them, never a hidden lab, a solution or an unfinished notebook', async () => {
    const { student, lab2, main, rule, search } = await setup();
    await rule(lab2.id, { visibleFrom: ago(60) });
    const { status, text } = await search(student);
    expect(status).toBe(200);
    const index = JSON.parse(text) as SearchIndex;
    expect(index.labs.map((l) => l.n)).toEqual([2]);
    expect(index.notebooks.map((nb) => nb.id)).toEqual([main.id]);
    expect(index.sections.map((s) => s.text)).toEqual(['HAPUR', 'MERGE']);
    for (const word of ['FSHEHUR', 'ZGJIDHJA', 'PAPERFUNDUAR', 'Grafet']) expect(text).not.toContain(word);
  });

  it('follows the schedule: nothing before a lab opens or after it closes, solutions from their date', async () => {
    const { student, lab2, rule, search } = await setup();
    await rule(lab2.id, { visibleFrom: later(3600) });
    expect((await search(student)).text).not.toContain('HAPUR');
    await rule(lab2.id, { visibleFrom: ago(3600), visibleUntil: ago(60) });
    expect((await search(student)).text).not.toContain('HAPUR');
    await rule(lab2.id, { visibleFrom: ago(60), solutionsFrom: later(3600) });
    expect((await search(student)).text).not.toContain('ZGJIDHJA');
    await rule(lab2.id, { visibleFrom: ago(60), solutionsFrom: ago(1) });
    expect((await search(student)).text).toContain('ZGJIDHJA');
  });

  it('gives staff every lab, hidden ones and solutions included, but not unfinished notebooks', async () => {
    const { pedagog, search } = await setup();
    const { text } = await search(pedagog);
    for (const word of ['FSHEHUR', 'HAPUR', 'ZGJIDHJA']) expect(text).toContain(word);
    expect(text).not.toContain('PAPERFUNDUAR');
  });

  it('answers 404 to anyone outside the course, in this organization or another', async () => {
    const { seed, search } = await setup();
    const outsider = await account(seed);
    const other = await seedOrganization('other');
    const otherPedagog = await account(other, 'pedagog');
    expect((await search(outsider)).status).toBe(404);
    expect((await search(otherPedagog)).status).toBe(404);
  });
});

describe("storing a notebook's search index", () => {
  it('lets staff replace it, and nobody else', async () => {
    const { pedagog, student, coursePath, lab2, main, rule, search } = await setup();
    await rule(lab2.id, { visibleFrom: ago(60) });
    const path = `${coursePath}/labs/${lab2.id}/notebooks/${main.id}/search`;
    const put = (who: typeof student, sections: unknown[]) => who.call(path, { method: 'PUT', body: { sections } });

    expect((await put(student, [section('NDRYSHUAR')])).status).toBe(403);
    expect((await put(pedagog, [section('NDRYSHUAR')])).status).toBe(204);
    const { text } = await search(student);
    expect(text).toContain('NDRYSHUAR');
    expect(text).not.toContain('MERGE');
  });

  it('refuses an index larger than the limits', async () => {
    const { pedagog, coursePath, lab2, main } = await setup();
    const path = `${coursePath}/labs/${lab2.id}/notebooks/${main.id}/search`;
    const sections = Array.from({ length: MAX_SECTIONS + 1 }, (_, i) => section(`S${i}`));
    expect((await pedagog.call(path, { method: 'PUT', body: { sections } })).status).toBe(400);
    const long = [{ ...section('X'), text: 'x'.repeat(5000) }];
    expect((await pedagog.call(path, { method: 'PUT', body: { sections: long } })).status).toBe(400);
  });

  it('stores the largest index in one request, within D1 limits', async () => {
    const { pedagog, seed, coursePath, lab2, main } = await setup();
    const path = `${coursePath}/labs/${lab2.id}/notebooks/${main.id}/search`;
    const sections = Array.from({ length: MAX_SECTIONS }, (_, i) => ({ ...section(`S${i}`), text: 't'.repeat(4000) }));
    expect((await pedagog.call(path, { method: 'PUT', body: { sections } })).status).toBe(204);
    expect(await seed.tenant.notebooks.searchSectionsOf([main.id])).toHaveLength(MAX_SECTIONS);
  });
});

describe("D1's limits for a search index", () => {
  it(`stays under 100 parameters per insert and 50 statements for ${MAX_SECTIONS} sections`, () => {
    const rows = Array.from({ length: ROWS_PER_INSERT }, (_, position) => ({
      id: uuidv7(),
      orgId: uuidv7(),
      notebookId: uuidv7(),
      position,
      ...section('X'),
    }));
    expect(createDb(env.DB).insert(searchSections).values(rows).toSQL().params.length).toBeLessThanOrEqual(100);
    // One delete, then the inserts.
    expect(1 + Math.ceil(MAX_SECTIONS / ROWS_PER_INSERT)).toBeLessThanOrEqual(50);
  });
});

describe('cross-tenant isolation: search sections', () => {
  it("cannot read or write another organization's search index", async () => {
    const a = await seedOrganization('a');
    const b = await seedOrganization('b');
    await b.tenant.notebooks.setSearchSections(b.notebook.id, [section('B')]);
    expect(await a.tenant.notebooks.searchSectionsOf([b.notebook.id])).toEqual([]);
    await expect(a.tenant.notebooks.setSearchSections(b.notebook.id, [section('A')])).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await b.tenant.notebooks.searchSectionsOf([b.notebook.id])).toHaveLength(1);
  });
});

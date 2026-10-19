import { describe, expect, it } from 'vitest';
import { EXPORT_PARTS, type ExportPage, type ExportPart } from '../../src/shared/org-export';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #117 is done when an admin downloads the export and finds a student's submission and grade in it;
// another institution's data never appears; no other role can export.

const at = (seconds: number) => new Date(Math.floor(Date.now() / 1000 + seconds) * 1000).toISOString();
type Caller = Awaited<ReturnType<typeof account>>;

/** Every page of every part, as the admin's browser gathers them. */
async function exportAll(who: Caller, org: string, limit?: number) {
  const tables = {} as Record<ExportPart, Record<string, unknown>[]>;
  for (const part of EXPORT_PARTS) {
    tables[part] = [];
    let after = '';
    for (;;) {
      const query = new URLSearchParams({ after, ...(limit ? { limit: String(limit) } : {}) });
      const res = await who.call(`/orgs/${org}/export/${part}?${query}`);
      expect(res.status, part).toBe(200);
      const page = (await res.json()) as ExportPage;
      tables[part].push(...page.rows);
      if (!page.next) break;
      after = page.next;
    }
  }
  return tables;
}

async function setup(slug: string) {
  const seed = await seedOrganization(slug);
  const { course, lab, notebook, group } = seed;
  const admin = await account(seed, 'admin');
  const pedagog = await account(seed, 'pedagog', { courseId: course.id });
  const ana = await account(seed, 'student', { groupId: group.id });
  const labPath = `/orgs/${slug}/courses/${course.id}/labs/${lab.id}`;
  const nbPath = `${labPath}/notebooks/${notebook.id}`;
  await pedagog.call(`${labPath}/access`, {
    method: 'PUT',
    body: { groupId: group.id, visibleFrom: at(-60), visibleUntil: null, solutionsFrom: null },
  });
  await pedagog.call(`${nbPath}/assignments/${group.id}`, { method: 'PUT', body: { dueAt: at(3600) } });
  await ana.call(`${nbPath}/edits/4`, { method: 'PUT', body: { code: `kodi_i_${slug} = 1` } });
  await ana.call(`${nbPath}/submission`, { method: 'POST' });
  await ana.call(`${nbPath}/edits/4`, { method: 'PUT', body: { code: `skice_private_${slug} = 2` } });
  await pedagog.call(`${nbPath}/grades/${ana.user.id}`, {
    method: 'PUT',
    body: { autoScore: 3, maxScore: 4, results: [{ cell: 4, status: 'pass' }] },
  });
  await seed.tenant.notebooks.putFile(notebook.id, 'notebook.ipynb', {
    mime: 'application/x-ipynb+json',
    encoding: 'identity',
    data: new TextEncoder().encode(JSON.stringify({ cells: [], nbformat: 4, metadata: { org: slug } })),
  });
  return { seed, admin, pedagog, ana };
}

describe("an institution's export (#117)", () => {
  it("holds its people, structure, submissions and grades, never another's data or a secret", async () => {
    const { seed, admin, ana } = await setup('fshn');
    await setup('tjeter');
    const tables = await exportAll(admin, 'fshn');

    expect(tables.people.map((p) => p.username)).toContain(ana.user.username);
    expect(tables.courses).toMatchObject([{ id: seed.course.id, title: seed.course.title }]);
    expect(tables.submissions).toMatchObject([{ userId: ana.user.id, code: [{ cell: 4, code: 'kodi_i_fshn = 1' }] }]);
    expect(tables.grades).toMatchObject([{ userId: ana.user.id, autoScore: 3, maxScore: 4 }]);

    const text = JSON.stringify(tables);
    expect(text).not.toContain('tjeter');
    expect(text).not.toMatch(/password|pbkdf2|joinCode|orgId/i);
    // A student's unsubmitted code stays theirs.
    expect(text).not.toContain('skice_private_fshn');

    const original = await admin.call(`/orgs/fshn/export/notebooks/${seed.notebook.id}`);
    expect(await original.json()).toMatchObject({ metadata: { org: 'fshn' } });
  });

  it('comes in pages that together hold every row', async () => {
    const { admin } = await setup('fshn');
    const whole = await exportAll(admin, 'fshn');
    const paged = await exportAll(admin, 'fshn', 1);
    expect(paged).toEqual(whole);
    expect(whole.people.length).toBeGreaterThan(2);
  });

  it('is only for the institution’s admins, and only for its own data', async () => {
    const { seed, pedagog, ana } = await setup('fshn');
    const other = await setup('tjeter');
    for (const who of [pedagog, ana]) {
      expect((await who.call('/orgs/fshn/export/people')).status).toBe(403);
      expect((await who.call(`/orgs/fshn/export/notebooks/${seed.notebook.id}`)).status).toBe(403);
    }
    expect((await other.admin.call('/orgs/fshn/export/people')).status).toBe(404);
    expect((await other.admin.call(`/orgs/tjeter/export/notebooks/${seed.notebook.id}`)).status).toBe(404);
    expect((await other.admin.call('/orgs/tjeter/export/sessions')).status).toBe(404);
  });
});

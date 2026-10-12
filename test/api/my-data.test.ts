import { describe, expect, it } from 'vitest';
import type { DeletionRequestView, MyData } from '../../src/shared/my-data';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #100 is done when a student downloads their data and finds their code and grade in it, and an
// admin sees their deletion request. Nobody downloads another user's data.

const at = (seconds: number) => new Date(Math.floor(Date.now() / 1000 + seconds) * 1000).toISOString();

async function setup() {
  const seed = await seedOrganization('fshn');
  const { course, lab, notebook, group } = seed;
  const admin = await account(seed, 'admin');
  const pedagog = await account(seed, 'pedagog', { courseId: course.id });
  const ana = await account(seed, 'student', { groupId: group.id });
  const besa = await account(seed, 'student', { groupId: group.id });
  const nbPath = `/orgs/${seed.org.slug}/courses/${course.id}/labs/${lab.id}/notebooks/${notebook.id}`;
  await pedagog.call(`/orgs/${seed.org.slug}/courses/${course.id}/labs/${lab.id}/access`, {
    method: 'PUT',
    body: { groupId: group.id, visibleFrom: at(-60), visibleUntil: null, solutionsFrom: null },
  });
  return { seed, admin, pedagog, ana, besa, nbPath };
}

describe('My data', () => {
  it("downloads everything stored about the user, with their code and released grade, and nobody else's", async () => {
    const { seed, pedagog, ana, besa, nbPath } = await setup();
    await ana.call(`${nbPath}/edits/4`, { method: 'PUT', body: { code: 'def shuma(a, b):\n    return a + b' } });
    await besa.call(`${nbPath}/edits/4`, { method: 'PUT', body: { code: 'besa_e_fshehte = 1' } });
    await pedagog.call(`${nbPath}/assignments/${seed.group.id}`, { method: 'PUT', body: { dueAt: at(3600) } });
    await ana.call(`${nbPath}/submission`, { method: 'POST' });
    await pedagog.call(`${nbPath}/grades/${ana.user.id}`, {
      method: 'PUT',
      body: { autoScore: 3, maxScore: 4, results: [{ cell: 4, status: 'pass' }] },
    });
    await pedagog.call(`${nbPath}/grades/release?group=${seed.group.id}`, { method: 'POST' });

    const res = await ana.call('/me/data');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    const text = await res.text();
    const data = JSON.parse(text) as MyData;
    expect(data.account).toMatchObject({ username: ana.user.username, fullName: ana.user.fullName });
    const fshn = data.organizations.find((o) => o.organization.slug === seed.org.slug);
    expect(fshn?.memberships).toMatchObject([{ role: 'student', group: seed.group.name }]);
    expect(fshn?.codeEdits).toMatchObject([{ cell: 4, code: 'def shuma(a, b):\n    return a + b' }]);
    expect(fshn?.submissions).toHaveLength(1);
    expect(fshn?.grades).toMatchObject([{ score: 3, maxScore: 4 }]);
    // Never a password hash, never another student's work.
    expect(text).not.toMatch(/password|pbkdf2/i);
    expect(text).not.toContain('besa_e_fshehte');
  });

  it('records a deletion request that only the institution’s admins see and handle', async () => {
    const { admin, pedagog, ana, seed } = await setup();
    const list = async () =>
      (await (await admin.call(`/orgs/${seed.org.slug}/deletion-requests`)).json()) as DeletionRequestView[];
    expect(
      (await ana.call('/me/deletion-request', { method: 'POST', body: { note: 'Mbarova studimet.' } })).status,
    ).toBe(204);
    await ana.call('/me/deletion-request', { method: 'POST', body: {} });
    expect(await list()).toMatchObject([{ username: ana.user.username, note: 'Mbarova studimet.', handledAt: null }]);
    expect((await pedagog.call(`/orgs/${seed.org.slug}/deletion-requests`)).status).toBe(403);
    expect((await ana.call(`/orgs/${seed.org.slug}/deletion-requests`)).status).toBe(403);

    const other = await seedOrganization('other');
    const otherAdmin = await account(other, 'admin');
    expect(await (await otherAdmin.call(`/orgs/${other.org.slug}/deletion-requests`)).json()).toEqual([]);

    const id = (await list())[0]?.id;
    expect(
      (await admin.call(`/orgs/${seed.org.slug}/deletion-requests/${id}/handled`, { method: 'POST' })).status,
    ).toBe(204);
    expect((await list())[0]?.handledAt).not.toBeNull();
    expect(
      (await admin.call(`/orgs/${seed.org.slug}/deletion-requests/${id}/handled`, { method: 'POST' })).status,
    ).toBe(404);
  });
});

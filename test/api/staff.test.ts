import { describe, expect, it } from 'vitest';
import { hashPassword } from '../../src/shared/password';
import type { StaffMember } from '../../src/shared/staff';
import type { SubmissionList } from '../../src/shared/submissions';
import { seedOrganization } from './fixtures';
import { account, caller, signIn } from './http';

// #64: pedagogs manage their course's staff in the app.

async function setup() {
  const seed = await seedOrganization('fshn');
  const groupB = await seed.tenant.groups.create({ courseId: seed.course.id, name: 'Grupi B' });
  const pedagog = await account(seed, 'pedagog', { courseId: seed.course.id });
  const assistant = await account(seed, 'assistant', { groupId: seed.group.id });
  const ana = await account(seed, 'student', { groupId: seed.group.id });
  const path = `/orgs/${seed.org.slug}/courses/${seed.course.id}/staff`;
  const list = async (who: typeof pedagog) => (await (await who.call(path)).json()) as StaffMember[];
  return { seed, groupB, pedagog, assistant, ana, path, list };
}

describe("a course's staff", () => {
  it('is managed by those who manage the course, never assistants or students', async () => {
    const { seed, pedagog, assistant, ana, path } = await setup();
    const body = { username: ana.user.username, role: 'assistant', groupId: seed.group.id };
    expect((await assistant.call(path)).status).toBe(403);
    expect((await ana.call(path, { method: 'POST', body })).status).toBe(403);
    expect((await assistant.call(path, { method: 'POST', body })).status).toBe(403);
    expect((await pedagog.call(path)).status).toBe(200);
  });

  it('adds a member of the organization to one group, who then reviews only that group', async () => {
    const { seed, groupB, pedagog, list, path } = await setup();
    // A student of group A becomes the assistant of group B.
    const other = await account(seed, 'student', { groupId: seed.group.id });
    const res = await pedagog.call(path, {
      method: 'POST',
      body: { username: other.user.username, role: 'assistant', groupId: groupB.id },
    });
    expect(res.status).toBe(201);
    expect((await list(pedagog)).filter((m) => m.userId === other.user.id)).toMatchObject([
      { role: 'assistant', groupId: groupB.id },
    ]);
    const nbPath = `/orgs/${seed.org.slug}/courses/${seed.course.id}/labs/${seed.lab.id}/notebooks/${seed.notebook.id}`;
    const reviewed = (await (await other.call(`${nbPath}/submissions`)).json()) as SubmissionList;
    expect(reviewed.groups.map((g) => g.name)).toEqual(['Grupi B']);
    expect((await other.call(`${nbPath}/submissions?group=${seed.group.id}`)).status).toBe(403);
    // Twice is refused, and an unknown username is not found.
    const again = { username: other.user.username, role: 'assistant', groupId: groupB.id };
    expect((await pedagog.call(path, { method: 'POST', body: again })).status).toBe(409);
    const nobody = { username: 'nuk.ekziston', role: 'assistant', groupId: null };
    expect((await pedagog.call(path, { method: 'POST', body: nobody })).status).toBe(404);
  });

  it("does not find another organization's accounts", async () => {
    const { pedagog, path } = await setup();
    const elsewhere = await seedOrganization('tjeter');
    const body = { username: elsewhere.user.username, role: 'pedagog', groupId: null };
    expect((await pedagog.call(path, { method: 'POST', body })).status).toBe(404);
  });

  it('creates an account with only the course role, which signs in with its password', async () => {
    const { pedagog, list, path } = await setup();
    const res = await pedagog.call(`${path}/new`, {
      method: 'POST',
      body: {
        fullName: 'Arta Hoxha',
        username: 'arta.hoxha',
        passwordHash: await hashPassword('Sakte-sakte-2026'),
        role: 'pedagog',
        groupId: null,
      },
    });
    expect(res.status).toBe(201);
    const { user } = (await res.json()) as { user: { id: string; username: string } };
    expect(user.username).toBe('arta.hoxha');
    expect((await list(pedagog)).filter((m) => m.userId === user.id)).toMatchObject([
      { role: 'pedagog', groupId: null },
    ]);
    const arta = caller(await signIn('arta.hoxha'));
    expect((await arta(path)).status).toBe(200);
  });

  it('removes a member, but never the last pedagog of the course', async () => {
    const { seed, pedagog, list, path } = await setup();
    const members = await list(pedagog);
    const assistantRow = members.find((m) => m.role === 'assistant');
    expect((await pedagog.call(`${path}/${assistantRow?.id}`, { method: 'DELETE' })).status).toBe(204);
    // Two course pedagogs (the seed's and ours): removing one is fine, the last is refused.
    const pedagogs = members.filter((m) => m.role === 'pedagog' && m.groupId === null);
    expect(pedagogs).toHaveLength(2);
    const seedPedagog = pedagogs.find((m) => m.userId === seed.user.id);
    expect((await pedagog.call(`${path}/${seedPedagog?.id}`, { method: 'DELETE' })).status).toBe(204);
    const mine = pedagogs.find((m) => m.userId !== seed.user.id);
    const last = await pedagog.call(`${path}/${mine?.id}`, { method: 'DELETE' });
    expect(last.status).toBe(409);
  });
});

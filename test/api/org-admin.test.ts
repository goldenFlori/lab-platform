import { describe, expect, it } from 'vitest';
import type { Branding } from '../../src/shared/branding';
import type { OrgPeoplePage } from '../../src/shared/org-admin';
import { hashPassword } from '../../src/shared/password';
import { seedOrganization } from './fixtures';
import { account, caller } from './http';

// #202: an institution's admin sees its people with their roles, gives staff a role across the
// institution (also with a new account), and sets its language and AI policy; never their own role
// nor the last admin's, and no one but its admins.

const PASSWORD = 'Pedagog-sakte-2026';

async function setup() {
  const seed = await seedOrganization('fshn');
  const admin = await account(seed, 'admin');
  const pedagog = await account(seed, 'pedagog', { courseId: seed.course.id });
  const student = await account(seed, 'student', { groupId: seed.group.id });
  const people = async (query = '') =>
    (await (await admin.call(`/orgs/fshn/admin/people?q=${encodeURIComponent(query)}`)).json()) as OrgPeoplePage;
  const role = (who: typeof admin, userId: string, value: string | null) =>
    who.call(`/orgs/fshn/admin/people/${userId}/role`, { method: 'PUT', body: { role: value } });
  return { seed, admin, pedagog, student, people, role };
}

describe("the institution admin's page", () => {
  it('lists its people with their roles, and finds them by name', async () => {
    const { admin, pedagog, student, people } = await setup();
    const all = (await people()).people;
    const find = (id: string) => all.find((p) => p.id === id);
    expect(find(admin.user.id)).toMatchObject({ orgRole: 'admin', teaches: 0, studies: 0 });
    expect(find(pedagog.user.id)).toMatchObject({ orgRole: null, teaches: 1, studies: 0 });
    expect(find(student.user.id)).toMatchObject({ orgRole: null, teaches: 0, studies: 1 });
    expect((await people(student.user.username)).people.map((p) => p.id)).toEqual([student.user.id]);
  });

  it('creates a staff account with a role across the institution, who can then create courses', async () => {
    const { admin } = await setup();
    const res = await admin.call('/orgs/fshn/admin/people', {
      method: 'POST',
      body: {
        fullName: 'Teuta Leka',
        username: 'teuta.leka',
        role: 'pedagog',
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    expect(res.status).toBe(201);
    const login = await caller()('/auth/login', {
      method: 'POST',
      body: { username: 'teuta.leka', password: PASSWORD },
    });
    const cookie = `__Host-session=${login.headers.get('Set-Cookie')?.match(/__Host-session=([^;]*)/)?.[1]}`;
    const course = await caller(cookie)('/orgs/fshn/courses', {
      method: 'POST',
      body: { title: 'Grafet', academicYear: '2026/27' },
    });
    expect(course.status).toBe(201);
    const again = await admin.call('/orgs/fshn/admin/people', {
      method: 'POST',
      body: {
        fullName: 'Teuta Leka',
        username: 'teuta.leka',
        role: 'pedagog',
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    expect([again.status, await again.json()]).toEqual([409, { error: 'username_taken' }]);
  });

  it('gives, changes and takes away roles, but never its own', async () => {
    const { admin, pedagog, people, role } = await setup();
    expect((await role(admin, pedagog.user.id, 'coordinator')).status).toBe(204);
    expect((await people()).people.find((p) => p.id === pedagog.user.id)?.orgRole).toBe('coordinator');
    expect((await role(admin, pedagog.user.id, null)).status).toBe(204);
    expect((await people()).people.find((p) => p.id === pedagog.user.id)?.orgRole).toBeNull();
    // The course role stays: only the institution-wide one went.
    expect((await people()).people.find((p) => p.id === pedagog.user.id)?.teaches).toBe(1);

    expect(await (await role(admin, admin.user.id, null)).json()).toEqual({ error: 'own_account' });
    // A second admin may take the first's role away only while another admin remains.
    expect((await role(admin, pedagog.user.id, 'admin')).status).toBe(204);
    expect((await role(pedagog, admin.user.id, null)).status).toBe(204);
    expect(await (await role(pedagog, pedagog.user.id, null)).json()).toEqual({ error: 'own_account' });
    expect((await role(pedagog, 'no-such-user', 'admin')).status).toBe(404);
  });

  it('sets the language and the AI policy; AI off turns it off in every course and keeps it off', async () => {
    const { seed, admin, pedagog, student } = await setup();
    // Courses are their pedagogs' to run; the institution's admin sets the policy over them all.
    await pedagog.call(`/orgs/fshn/courses/${seed.course.id}`, { method: 'PATCH', body: { ai: true } });
    const settings = (body: unknown) => admin.call('/orgs/fshn/admin/settings', { method: 'PUT', body });
    expect((await settings({ locale: 'en', aiAllowed: false })).status).toBe(204);
    const view = (await (await student.call('/orgs/fshn/branding')).json()) as Branding;
    expect(view).toMatchObject({ locale: 'en', aiAllowed: false });
    const course = (await (await pedagog.call(`/orgs/fshn/courses/${seed.course.id}`)).json()) as {
      course: { ai: boolean };
    };
    expect(course.course.ai).toBe(false);
    const again = await pedagog.call(`/orgs/fshn/courses/${seed.course.id}`, { method: 'PATCH', body: { ai: true } });
    expect([again.status, await again.json()]).toEqual([409, { error: 'ai_not_allowed' }]);
    expect((await settings({ locale: 'xx', aiAllowed: true })).status).toBe(400);
    expect(
      (await pedagog.call('/orgs/fshn/admin/settings', { method: 'PUT', body: { locale: null, aiAllowed: true } }))
        .status,
    ).toBe(403);
  });

  it('is for its admins only, and for their institution only', async () => {
    const { pedagog, student } = await setup();
    for (const who of [pedagog, student]) expect((await who.call('/orgs/fshn/admin/people')).status).toBe(403);
    const other = await seedOrganization('upt');
    const outsider = await account(other, 'admin');
    expect((await outsider.call('/orgs/fshn/admin/people')).status).toBe(404);
  });
});

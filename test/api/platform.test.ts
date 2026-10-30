import { describe, expect, it } from 'vitest';
import type { Me } from '../../src/shared/auth';
import { hashPassword } from '../../src/shared/password';
import type { Institution } from '../../src/shared/platform';
import { seedOrganization } from './fixtures';
import { account, caller, signIn } from './http';

// #200 is done when the platform's owner creates an institution with its first admin, who can sign in
// and run it, and sees every institution's counts; and when no one else can tell the console exists.

const ADMIN_PASSWORD = 'Admin-sakte-2026';

async function setup() {
  const seed = await seedOrganization('fshn');
  const owner = await account(seed, undefined, {}, 'owner.test');
  const admin = await account(seed, 'admin');
  return { seed, owner, admin };
}

const newInstitution = async (slug = 'upt', username = 'admin.upt') => ({
  name: 'Universiteti Politeknik',
  slug,
  admin: { fullName: 'Arta Krasniqi', username, passwordHash: await hashPassword(ADMIN_PASSWORD) },
});

describe("the owner's console", () => {
  it('is hidden from everyone but the owner, as a route that does not exist', async () => {
    const { owner, admin } = await setup();
    expect((await owner.call('/platform/institutions')).status).toBe(200);
    for (const who of [admin.call, caller()]) {
      const res = await who('/platform/institutions');
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
      expect((await who('/platform/institutions', { method: 'POST', body: await newInstitution() })).status).toBe(404);
    }
    expect(((await (await owner.call('/me')).json()) as Me).owner).toBe(true);
    expect(((await (await admin.call('/me')).json()) as Me).owner).toBeUndefined();
  });

  it('creates an institution whose first admin signs in and creates its first course', async () => {
    const { owner } = await setup();
    const res = await owner.call('/platform/institutions', { method: 'POST', body: await newInstitution() });
    expect(res.status).toBe(201);

    const login = await caller()('/auth/login', {
      method: 'POST',
      body: { username: 'admin.upt', password: ADMIN_PASSWORD },
    });
    expect(login.status).toBe(200);
    const cookie = `__Host-session=${login.headers.get('Set-Cookie')?.match(/__Host-session=([^;]*)/)?.[1]}`;
    const me = (await (await caller(cookie)('/me')).json()) as Me;
    expect(me.organizations.map((o) => o.slug)).toEqual(['upt']);
    const course = await caller(cookie)('/orgs/upt/courses', {
      method: 'POST',
      body: { title: 'Algoritmet', academicYear: '2026/27' },
    });
    expect(course.status).toBe(201);
  });

  it('refuses a slug or a username already taken, and changes nothing', async () => {
    const { owner, admin } = await setup();
    const taken = await owner.call('/platform/institutions', { method: 'POST', body: await newInstitution('fshn') });
    expect([taken.status, await taken.json()]).toEqual([409, { error: 'slug_taken' }]);
    const user = await owner.call('/platform/institutions', {
      method: 'POST',
      body: await newInstitution('upt', admin.user.username),
    });
    expect([user.status, await user.json()]).toEqual([409, { error: 'username_taken' }]);
    const bad = await owner.call('/platform/institutions', {
      method: 'POST',
      body: { ...(await newInstitution()), slug: 'UPT!' },
    });
    expect(bad.status).toBe(400);
    const list = (await (await owner.call('/platform/institutions')).json()) as { institutions: Institution[] };
    expect(list.institutions.map((i) => i.slug)).toEqual(['fshn']);
  });

  it('lists every institution with its counts, never its people', async () => {
    const { seed, owner } = await setup();
    await account(seed, 'student', { groupId: seed.group.id });
    await account(seed, 'student', { groupId: seed.group.id });
    await account(seed, 'pedagog', { courseId: seed.course.id });
    await owner.call('/platform/institutions', { method: 'POST', body: await newInstitution() });
    const { institutions } = (await (await owner.call('/platform/institutions')).json()) as {
      institutions: Institution[];
    };
    const fshn = institutions.find((i) => i.slug === 'fshn');
    // The fixture's pedagog, the admin of setup() and this pedagog; the owner has no membership anywhere.
    expect(fshn).toMatchObject({ courses: 1, students: 2, staff: 3, activeThisWeek: 0 });
    expect(institutions.find((i) => i.slug === 'upt')).toMatchObject({ courses: 0, students: 0, staff: 1 });
    expect(JSON.stringify(institutions)).not.toMatch(/student\.|admin\.upt|Arta/);
  });

  it('knows more than one owner, by the secret alone', async () => {
    const { seed } = await setup();
    const second = await account(seed, undefined, {}, 'second.owner');
    expect((await second.call('/platform/institutions')).status).toBe(200);
    // Nothing a tenant can change makes an owner: the same name in another organization is still a name.
    expect(await signIn('owner.test')).toMatch(/__Host-session=/);
  });
});

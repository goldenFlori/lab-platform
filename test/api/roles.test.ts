import { env, exports } from 'cloudflare:workers';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { Access, requireCapability, type TenantEnv, tenantAccess } from '../../src/api/auth/access';
import { createDb } from '../../src/api/db';
import { listRoles } from '../../src/api/db/access';
import { InvalidInputError } from '../../src/api/db/tenant';
import { handleError, notFound } from '../../src/api/errors';
import { CAPABILITIES, type Capability, isCapability } from '../../src/shared/capabilities';
import { hashPassword } from '../../src/shared/password';
import { type Seeded, seedOrganization } from './fixtures';

/** The agreed permissions of each built-in role: the specification the database must match. */
const ROLES: Record<string, Capability[]> = {
  admin: ['org.manage', 'staff.approve', 'analytics.view', 'course.create'],
  coordinator: [
    'analytics.view',
    'course.create',
    'course.template.edit',
    'course.manage',
    'lab.view',
    'lab.publish',
    'solution.view',
    'student.manage',
    'submission.review',
    'grade.edit',
    'live.host',
    'ai.configure',
  ],
  pedagog: [
    'analytics.view',
    'course.create',
    'course.manage',
    'lab.view',
    'lab.publish',
    'solution.view',
    'student.manage',
    'submission.review',
    'grade.edit',
    'live.host',
    'ai.configure',
  ],
  assistant: ['lab.view', 'solution.view', 'student.manage', 'submission.review', 'live.host'],
  student: ['lab.view', 'submission.create'],
};

/** A stand-in for the session: the real permission middleware, one route per capability. */
function appFor(userId: string) {
  const routes = new Hono<TenantEnv>().use('/:org/*', tenantAccess);
  for (const capability of CAPABILITIES) {
    routes.get(
      `/:org/try/${capability}`,
      requireCapability(capability, (c) => ({ courseId: c.req.query('course'), groupId: c.req.query('group') })),
      (c) => c.json({ ok: true }),
    );
  }
  return new Hono<TenantEnv>()
    .use(async (c, next) => {
      c.set('user', { id: userId, username: 'test', fullName: 'Test', locale: null });
      await next();
    })
    .route('/orgs', routes)
    .notFound(notFound)
    .onError(handleError);
}

async function tryAs(seed: Seeded, userId: string, capability: Capability, target = '') {
  const res = await appFor(userId).request(`/orgs/${seed.org.slug}/try/${capability}${target}`, {}, env);
  return res.status;
}

/**
 * A user whose only role in the organization is `role`: organization-wide, or only in the given
 * course or group (the organization-wide membership every new user starts with is then removed).
 */
async function memberWith(seed: Seeded, role: string, scope: { courseId?: string; groupId?: string } = {}) {
  const scoped = Boolean(scope.courseId || scope.groupId);
  const user = await seed.tenant.users.create(
    { username: `${role}.${crypto.randomUUID().slice(0, 8)}`, fullName: role },
    scoped ? 'student' : role,
  );
  if (scoped) {
    const orgWide = (await seed.tenant.memberships.list()).find(
      (m) => m.userId === user.id && !m.courseId && !m.groupId,
    );
    await seed.tenant.memberships.create({ userId: user.id, role, ...scope });
    if (orgWide) await seed.tenant.memberships.remove(orgWide.id);
  }
  return user;
}

describe('role templates', () => {
  it('has exactly the agreed built-in roles and capabilities', async () => {
    const rows = await listRoles(createDb(env.DB));
    const sorted = (list: string[]) => [...list].sort();
    expect(Object.fromEntries(rows.map((r) => [r.key, sorted(r.capabilities)]))).toEqual(
      Object.fromEntries(Object.entries(ROLES).map(([key, list]) => [key, sorted(list)])),
    );
  });

  it('grants only capabilities the API knows', async () => {
    for (const role of await listRoles(createDb(env.DB))) {
      expect(role.capabilities.filter((c) => !isCapability(c))).toEqual([]);
    }
  });

  it('refuses memberships with a role that does not exist', async () => {
    const seed = await seedOrganization('fshn');
    await expect(seed.tenant.memberships.create({ userId: seed.user.id, role: 'superuser' })).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    await expect(seed.tenant.memberships.update(seed.membership.id, { role: 'superuser' })).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    await expect(seed.tenant.users.create({ username: 'x.y', fullName: 'X Y' }, 'superuser')).rejects.toBeInstanceOf(
      InvalidInputError,
    );
  });
});

describe.each(Object.entries(ROLES))('organization-wide %s', (role, allowed) => {
  it('may do exactly what the role allows, and nothing else', async () => {
    const seed = await seedOrganization('fshn');
    const user = await memberWith(seed, role);
    const results = Object.fromEntries(
      await Promise.all(CAPABILITIES.map(async (cap) => [cap, await tryAs(seed, user.id, cap)] as const)),
    );
    expect(results).toEqual(Object.fromEntries(CAPABILITIES.map((cap) => [cap, allowed.includes(cap) ? 200 : 403])));
  });
});

describe('scopes', () => {
  async function seedTwoGroups() {
    const seed = await seedOrganization('fshn');
    const otherCourse = await seed.tenant.courses.create({ title: 'Other', academicYear: '2026/27' });
    const sibling = await seed.tenant.groups.create({ courseId: seed.course.id, name: 'Grupi B' });
    return { seed, otherCourse, sibling };
  }

  it('a pedagog of one course acts in that course and its groups, not in another course', async () => {
    const { seed, otherCourse } = await seedTwoGroups();
    const pedagog = await memberWith(seed, 'pedagog', { courseId: seed.course.id });
    expect(await tryAs(seed, pedagog.id, 'lab.publish', `?course=${seed.course.id}`)).toBe(200);
    expect(await tryAs(seed, pedagog.id, 'student.manage', `?course=${seed.course.id}&group=${seed.group.id}`)).toBe(
      200,
    );
    expect(await tryAs(seed, pedagog.id, 'lab.publish', `?course=${otherCourse.id}`)).toBe(403);
    expect(await tryAs(seed, pedagog.id, 'course.create')).toBe(403);
  });

  it('an assistant of one group helps in that group only, and cannot change the course', async () => {
    const { seed, sibling } = await seedTwoGroups();
    const assistant = await memberWith(seed, 'assistant', { groupId: seed.group.id });
    expect(await tryAs(seed, assistant.id, 'student.manage', `?course=${seed.course.id}&group=${seed.group.id}`)).toBe(
      200,
    );
    expect(await tryAs(seed, assistant.id, 'student.manage', `?course=${seed.course.id}&group=${sibling.id}`)).toBe(
      403,
    );
    expect(await tryAs(seed, assistant.id, 'course.manage', `?course=${seed.course.id}&group=${seed.group.id}`)).toBe(
      403,
    );
    expect(await tryAs(seed, assistant.id, 'lab.publish', `?course=${seed.course.id}&group=${seed.group.id}`)).toBe(
      403,
    );
  });

  it('a student sees labs in their group, never solutions or other groups', async () => {
    const { seed, sibling } = await seedTwoGroups();
    const student = await memberWith(seed, 'student', { groupId: seed.group.id });
    const inGroup = `?course=${seed.course.id}&group=${seed.group.id}`;
    expect(await tryAs(seed, student.id, 'lab.view', inGroup)).toBe(200);
    expect(await tryAs(seed, student.id, 'submission.create', inGroup)).toBe(200);
    expect(await tryAs(seed, student.id, 'solution.view', inGroup)).toBe(403);
    expect(await tryAs(seed, student.id, 'lab.view', `?course=${seed.course.id}&group=${sibling.id}`)).toBe(403);
  });

  it('someone outside the organization gets the same 404 as for an organization that does not exist', async () => {
    const a = await seedOrganization('a');
    const b = await seedOrganization('b');
    const outsider = await appFor(b.user.id).request(`/orgs/${a.org.slug}/try/lab.view`, {}, env);
    const nowhere = await appFor(b.user.id).request('/orgs/no-such-org/try/lab.view', {}, env);
    expect(outsider.status).toBe(404);
    expect(nowhere.status).toBe(404);
    expect(await outsider.json()).toEqual(await nowhere.json());
  });
});

describe('Access', () => {
  const access = new Access([
    { courseId: null, groupId: null, capabilities: ['analytics.view'] },
    { courseId: 'c1', groupId: null, capabilities: ['lab.publish'] },
    { courseId: null, groupId: 'g1', capabilities: ['live.host'] },
  ]);

  it('applies each grant in its own scope only', () => {
    expect(access.can('analytics.view', { courseId: 'c9', groupId: 'g9' })).toBe(true);
    expect(access.can('lab.publish', { courseId: 'c1', groupId: 'g5' })).toBe(true);
    expect(access.can('lab.publish', { courseId: 'c2' })).toBe(false);
    expect(access.can('lab.publish')).toBe(false);
    expect(access.can('live.host', { courseId: 'c1', groupId: 'g1' })).toBe(true);
    expect(access.can('live.host', { courseId: 'c1' })).toBe(false);
  });

  it('knows where something is possible at all, and summarizes by scope', () => {
    expect(access.canSomewhere('live.host')).toBe(true);
    expect(access.canSomewhere('grade.edit')).toBe(false);
    expect(access.summary()).toEqual({
      organization: ['analytics.view'],
      courses: { c1: ['lab.publish'] },
      groups: { g1: ['live.host'] },
    });
  });
});

describe('GET /api/orgs/:org/access', () => {
  const ORIGIN = 'https://lab.test';

  async function signIn(username: string) {
    const res = await exports.default.fetch(`${ORIGIN}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'Sakte-sakte-2026' }),
    });
    return `__Host-session=${res.headers.get('Set-Cookie')?.match(/__Host-session=([^;]*)/)?.[1]}`;
  }

  it("returns the user's capabilities by scope, and 404 outside the organization", async () => {
    const a = await seedOrganization('a');
    const b = await seedOrganization('b');
    const passwordHash = await hashPassword('Sakte-sakte-2026');
    const teacher = await a.tenant.users.create(
      { username: 'mesuesja', fullName: 'Mësuesja', passwordHash },
      'pedagog',
    );
    await a.tenant.memberships.create({ userId: teacher.id, courseId: a.course.id, role: 'coordinator' });
    const cookie = await signIn('mesuesja');

    const own = await exports.default.fetch(`${ORIGIN}/api/orgs/${a.org.slug}/access`, { headers: { Cookie: cookie } });
    expect(own.status).toBe(200);
    expect(await own.json()).toEqual({
      organization: { id: a.org.id, name: a.org.name, slug: a.org.slug },
      capabilities: {
        organization: [...ROLES.pedagog].sort(),
        courses: { [a.course.id]: [...ROLES.coordinator].sort() },
        groups: {},
      },
    });

    const other = await exports.default.fetch(`${ORIGIN}/api/orgs/${b.org.slug}/access`, {
      headers: { Cookie: cookie },
    });
    expect(other.status).toBe(404);
    expect((await exports.default.fetch(`${ORIGIN}/api/orgs/${a.org.slug}/access`)).status).toBe(401);
  });

  it('answers an unknown role with 400', async () => {
    const app = new Hono()
      .get('/x', () => {
        throw new InvalidInputError('Unknown role: superuser');
      })
      .onError(handleError);
    const res = await app.request('/x');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_request' });
  });
});

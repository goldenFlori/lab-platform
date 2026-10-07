import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { seedOrganization } from './fixtures';

/** The database's own message for a rejected query (Drizzle keeps it as the cause). */
async function databaseError(query: Promise<unknown>) {
  try {
    await query;
  } catch (error) {
    return String((error as Error).cause ?? error);
  }
  throw new Error('The query was expected to fail');
}

describe('database', () => {
  it('applies the migrations inside workerd', async () => {
    const { results } = await env.DB.prepare('select name from d1_migrations order by id').all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual(env.TEST_MIGRATIONS.map((m) => m.name));
    expect(results.length).toBeGreaterThan(2);
  });

  it('enforces foreign keys', async () => {
    const { results } = await env.DB.prepare('pragma foreign_keys').all<{ foreign_keys: number }>();
    expect(results[0]?.foreign_keys).toBe(1);
  });

  it('rejects a duplicate organization slug', async () => {
    await seedOrganization('same');
    await expect(seedOrganization('same')).rejects.toThrow();
  });
});

describe('users', () => {
  it('stores usernames in lowercase and adds the user to the organization', async () => {
    const { tenant } = await seedOrganization('fshn');
    const user = await tenant.users.create({ username: 'Arben.Hoxha', fullName: 'Arben Hoxha' }, 'student');
    expect(user.username).toBe('arben.hoxha');
    expect(user.status).toBe('active');
    expect(await tenant.memberships.list()).toContainEqual(
      expect.objectContaining({ userId: user.id, role: 'student', courseId: null, groupId: null }),
    );
  });

  it('keeps usernames unique across the platform', async () => {
    const a = await seedOrganization('a');
    const b = await seedOrganization('b');
    await a.tenant.users.create({ username: 'same.name', fullName: 'One' }, 'student');
    await expect(b.tenant.users.create({ username: 'Same.Name', fullName: 'Two' }, 'student')).rejects.toThrow();
  });
});

describe('memberships', () => {
  it('allows one role per user and scope', async () => {
    const { tenant, user, course } = await seedOrganization('fshn');
    expect(await databaseError(tenant.memberships.create({ userId: user.id, role: 'admin' }))).toMatch(/UNIQUE/);
    expect(
      await databaseError(tenant.memberships.create({ userId: user.id, courseId: course.id, role: 'coordinator' })),
    ).toMatch(/UNIQUE/);
  });

  it('belongs to the organization, a course or a group, never both a course and a group', async () => {
    const { tenant, user, course, group } = await seedOrganization('fshn');
    expect(
      await databaseError(
        tenant.memberships.create({ userId: user.id, courseId: course.id, groupId: group.id, role: 'assistant' }),
      ),
    ).toMatch(/CHECK/);
    expect(await tenant.memberships.create({ userId: user.id, groupId: group.id, role: 'assistant' })).toMatchObject({
      groupId: group.id,
      courseId: null,
    });
  });
});

describe('deleting', () => {
  it("removes a course's groups, labs, lab access and memberships with it", async () => {
    const { tenant, course, group, lab, labAccess, membership } = await seedOrganization('fshn');
    expect(await tenant.courses.remove(course.id)).toBe(true);
    expect(await tenant.groups.get(group.id)).toBeUndefined();
    expect(await tenant.labs.get(lab.id)).toBeUndefined();
    expect(await tenant.labAccess.get(labAccess.id)).toBeUndefined();
    expect(await tenant.memberships.get(membership.id)).toBeUndefined();
  });

  it('refuses to delete a template that courses were made from', async () => {
    const { tenant, template } = await seedOrganization('fshn');
    await expect(tenant.courseTemplates.remove(template.id)).rejects.toThrow();
    expect(await tenant.courseTemplates.get(template.id)).toBeDefined();
  });
});

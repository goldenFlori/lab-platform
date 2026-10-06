import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { seedOrganization } from './fixtures';

describe('database', () => {
  it('applies the migrations inside workerd', async () => {
    const { results } = await env.DB.prepare('select name from d1_migrations order by id').all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual(['0000_organizations.sql', '0001_core_data_model.sql']);
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
    await expect(tenant.memberships.create({ userId: user.id, role: 'admin' })).rejects.toThrow();
    await expect(tenant.memberships.create({ userId: user.id, courseId: course.id, role: 'x' })).rejects.toThrow();
  });

  it('belongs to the organization, a course or a group, never both a course and a group', async () => {
    const { tenant, user, course, group } = await seedOrganization('fshn');
    await expect(
      tenant.memberships.create({ userId: user.id, courseId: course.id, groupId: group.id, role: 'x' }),
    ).rejects.toThrow();
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

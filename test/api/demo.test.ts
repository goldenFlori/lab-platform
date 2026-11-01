import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { resetDemo } from '../../src/api/db/demo';
import { courses, grades, groups, labAccess, memberships, users } from '../../src/api/db/schema';
import type { CourseDetail } from '../../src/shared/courses';
import type { DemoStatus } from '../../src/shared/demo';
import { seedOrganization } from './fixtures';
import { account, caller } from './http';

// #216: the demo institution is rebuilt from its template course with made-up classmates and their
// work; visitors sign in to its shared accounts without a password, and those accounts change only
// what trying the platform needs.

async function setup() {
  const seed = await seedOrganization('demo');
  await seed.tenant.exercises.set(seed.notebook.id, [
    { cell: 3, title: 'BFS', test: null },
    { cell: 5, title: 'DFS', test: null },
  ]);
  return seed;
}

/** A visitor signed in as the demo's student or pedagog. */
async function visitor(role: 'student' | 'pedagog') {
  const res = await caller()(`/demo/${role}`, { method: 'POST' });
  expect(res.status).toBe(200);
  const { courseId } = (await res.json()) as { courseId: string };
  const cookie = `__Host-session=${res.headers.get('Set-Cookie')?.match(/__Host-session=([^;]*)/)?.[1]}`;
  return { call: caller(cookie), courseId };
}

describe('the demo institution', () => {
  it('is rebuilt from its template with made-up classmates and their work', async () => {
    const seed = await setup();
    const reset = await resetDemo(seed.db);
    expect(reset?.courseId).toBeDefined();
    const courseId = reset?.courseId as string;
    expect(courseId).not.toBe(seed.course.id);

    const [group] = await seed.db.select().from(groups).where(eq(groups.courseId, courseId));
    const students = await seed.db
      .select({ username: users.username })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.groupId, group?.id as string), eq(memberships.role, 'student')));
    expect(students).toHaveLength(12);
    expect(students.map((s) => s.username)).toContain('demo.studenti');
    const [lab] = await seed.tenant.labs.ofCourse(courseId);
    expect(
      await seed.db
        .select()
        .from(labAccess)
        .where(eq(labAccess.labId, lab?.id as string)),
    ).toHaveLength(1);
    const released = await seed.db.select().from(grades).where(eq(grades.orgId, seed.org.id));
    expect(released.length).toBeGreaterThan(0);
    expect(released.every((g) => g.releasedAt !== null)).toBe(true);

    // The next night: a fresh course, the template kept, nobody twice.
    const again = await resetDemo(seed.db);
    const left = await seed.db.select({ id: courses.id }).from(courses).where(eq(courses.orgId, seed.org.id));
    expect(left.map((c) => c.id).sort()).toEqual([seed.course.id, again?.courseId].sort());
    expect(await seed.db.select().from(users).where(eq(users.username, 'demo.ana'))).toHaveLength(1);
  });

  it('leaves out a made-up name someone in another institution already has', async () => {
    const seed = await setup();
    const other = await seedOrganization('other');
    await other.tenant.users.create({ username: 'demo.ana', fullName: 'Ana e vërtetë' }, 'student');
    const { courseId } = (await resetDemo(seed.db)) as { courseId: string };
    const rows = await seed.db
      .select({ username: users.username })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, seed.org.id));
    expect(rows.map((r) => r.username)).not.toContain('demo.ana');
    expect(courseId).toBeDefined();
  });

  it('signs visitors in without a password, and lets them change only what trying it needs', async () => {
    const seed = await setup();
    expect(((await (await caller()('/demo')).json()) as DemoStatus).enabled).toBe(false);
    await resetDemo(seed.db);
    expect(((await (await caller()('/demo')).json()) as DemoStatus).enabled).toBe(true);
    expect((await caller()('/demo/admin', { method: 'POST' })).status).toBe(404);

    const student = await visitor('student');
    const coursePath = `/orgs/demo/courses/${student.courseId}`;
    expect((await student.call(coursePath)).status).toBe(200);
    const [lab] = await seed.tenant.labs.ofCourse(student.courseId);
    const [nb] = await seed.tenant.notebooks.ofLab(lab?.id as string);
    const nbPath = `${coursePath}/labs/${lab?.id}/notebooks/${nb?.id}`;
    const work = await student.call(`${nbPath}/work`, {
      method: 'PUT',
      body: { code: [{ cell: 3, code: 'x' }], traces: [] },
    });
    expect(work.status).toBe(200);
    const asked = await student.call('/me/deletion-request', { method: 'POST', body: {} });
    expect([asked.status, await asked.json()]).toEqual([403, { error: 'demo_read_only' }]);

    const pedagog = await visitor('pedagog');
    const detail = (await (await pedagog.call(coursePath)).json()) as CourseDetail;
    const groupId = detail.groups[0]?.id as string;
    const refused = [
      pedagog.call(coursePath, { method: 'DELETE' }),
      pedagog.call(`${coursePath}/groups/${groupId}/students`, { method: 'POST', body: { students: [] } }),
      pedagog.call(`${coursePath}/share`, { method: 'PUT', body: { solutions: true } }),
      pedagog.call(`${coursePath}/labs/${lab?.id}/notebooks`, { method: 'POST', body: {} }),
    ];
    for (const res of await Promise.all(refused)) expect(res.status).toBe(403);
    const opened = await pedagog.call(`${coursePath}/labs/${lab?.id}/access`, {
      method: 'PUT',
      body: { groupId: null, visibleFrom: null, visibleUntil: null, solutionsFrom: null },
    });
    expect(opened.status).toBe(200);
  });

  it('is rebuilt on request by the platform owner, and only by them', async () => {
    const seed = await setup();
    const owner = await account(seed, 'admin', {}, 'owner.test');
    const admin = await account(seed, 'admin');
    expect((await admin.call('/platform/demo/reset', { method: 'POST' })).status).toBe(404);
    const res = await owner.call('/platform/demo/reset', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { courseId: string }).courseId).toBeDefined();
  });
});

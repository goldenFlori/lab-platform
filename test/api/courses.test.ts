import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { MAX_JOIN_FAILURES } from '../../src/api/auth/limits';
import type { CourseDetail, CourseSummary, JoinResult } from '../../src/shared/courses';
import { formatJoinCode } from '../../src/shared/join-code';
import { seedOrganization } from './fixtures';
import { account } from './http';

const json = async <T>(res: Response) => (await res.json()) as T;

async function setup() {
  const seed = await seedOrganization('fshn');
  const admin = await account(seed, 'admin');
  const orgPath = `/orgs/${seed.org.slug}`;
  return { seed, admin, orgPath };
}

describe('creating courses', () => {
  it('lets someone with course.create make a course and makes them its pedagog', async () => {
    const { admin, orgPath } = await setup();
    const res = await admin.call(`${orgPath}/courses`, {
      method: 'POST',
      body: { title: 'SDA 2027/28', academicYear: '2027/28' },
    });
    expect(res.status).toBe(201);
    const course = await json<CourseSummary>(res);
    expect(course).toMatchObject({ title: 'SDA 2027/28', academicYear: '2027/28', archivedAt: null });

    const detail = await json<CourseDetail>(await admin.call(`${orgPath}/courses/${course.id}`));
    expect(detail.permissions.manage).toBe(true);
    expect((await json<CourseSummary[]>(await admin.call(`${orgPath}/courses`))).map((c) => c.id)).toContain(course.id);
  });

  it('refuses people without course.create, and malformed courses', async () => {
    const { seed, admin, orgPath } = await setup();
    const assistant = await account(seed, 'assistant', { courseId: seed.course.id });
    const body = { title: 'X', academicYear: '2027/28' };
    expect((await assistant.call(`${orgPath}/courses`, { method: 'POST', body })).status).toBe(403);
    const bad = await admin.call(`${orgPath}/courses`, { method: 'POST', body: { title: '', academicYear: '27' } });
    expect(bad.status).toBe(400);
  });

  it("starts a new term from last year's whole course, but not its groups, people, visibility or work (#210)", async () => {
    const { seed, orgPath } = await setup();
    const { tenant, notebook, lab } = seed;
    await tenant.labs.create({ courseId: seed.course.id, n: 2, title: 'Pemët', position: 2 });
    await tenant.notebooks.putFile(notebook.id, 'notebook.ipynb', {
      mime: 'application/json',
      encoding: 'identity',
      data: new TextEncoder().encode('{"cells":[]}'),
    });
    await tenant.exercises.set(notebook.id, [{ cell: 3, title: 'BFS', test: 'assert bfs() == 1' }]);
    await tenant.grading.setSetup(notebook.id, [{ cell: 3, points: 5, hiddenTest: 'assert bfs() == 2' }]);
    await tenant.notebooks.create({
      labId: lab.id,
      kind: 'solution',
      title: 'Zgjidhjet',
      position: 2,
      originalName: 'zgjidhjet.ipynb',
      sha256: '1'.repeat(64),
      readyAt: new Date(),
    });
    const student = await account(seed, 'student', { groupId: seed.group.id });
    await tenant.codeEdits.save({ notebookId: notebook.id, userId: student.user.id, cell: 3, code: 'x' });

    const pedagog = await account(seed, 'pedagog', { courseId: seed.course.id });
    const body = { title: 'SDA 2027/28', academicYear: '2027/28', copyFromCourseId: seed.course.id };
    const res = await pedagog.call(`${orgPath}/courses`, { method: 'POST', body });
    expect(res.status).toBe(403); // a course-level pedagog cannot create courses

    const coordinator = await account(seed, 'coordinator');
    const copy = await json<CourseSummary>(
      await coordinator.call(`${orgPath}/courses`, { method: 'POST', body: { ...body, locale: 'en' } }),
    );
    expect(copy).toMatchObject({ locale: 'en', copiedFrom: { title: 'SDA 2026/27', institution: 'Org fshn' } });
    expect((await tenant.courses.get(copy.id))?.templateId).toBe(seed.template.id);
    const labs = await tenant.labs.ofCourse(copy.id);
    expect(labs.map((l) => [l.n, l.title])).toEqual([
      [1, 'Grafet'],
      [2, 'Pemët'],
    ]);
    const notebooks = await tenant.notebooks.ofLab(labs[0]?.id as string);
    expect(notebooks.map((n) => n.kind)).toEqual(['main', 'solution']);
    const main = notebooks[0]?.id as string;
    expect(new TextDecoder().decode((await tenant.notebooks.getFile(main, 'notebook.ipynb'))?.data)).toBe(
      '{"cells":[]}',
    );
    expect(await tenant.notebooks.embedsOf(main)).toMatchObject([{ cell: 2, viz: 'grafet' }]);
    expect(await tenant.exercises.of(main)).toMatchObject([{ cell: 3, title: 'BFS' }]);
    expect(await tenant.grading.setupOf(main)).toMatchObject([{ cell: 3, points: 5 }]);
    // Nothing of last year's people: no groups, no visibility, no student's code, only the creator.
    expect(await tenant.groups.ofCourse(copy.id)).toEqual([]);
    expect(await tenant.labAccess.ofCourse(copy.id)).toEqual([]);
    expect(await tenant.codeEdits.ofUser(main, student.user.id)).toEqual([]);
    const members = (await tenant.memberships.list()).filter((m) => m.courseId === copy.id);
    expect(members.map((m) => [m.userId, m.role])).toEqual([[coordinator.user.id, 'pedagog']]);
  });

  it('leaves the solutions out for a creator who may not see them', async () => {
    const { seed, admin, orgPath } = await setup();
    await seed.tenant.notebooks.create({
      labId: seed.lab.id,
      kind: 'solution',
      title: 'Zgjidhjet',
      position: 2,
      originalName: 'zgjidhjet.ipynb',
      sha256: '1'.repeat(64),
      readyAt: new Date(),
    });
    // An admin who is also a student of the course sees it, but not its solutions.
    await seed.tenant.memberships.create({ userId: admin.user.id, groupId: seed.group.id, role: 'student' });
    const copy = await json<CourseSummary>(
      await admin.call(`${orgPath}/courses`, {
        method: 'POST',
        body: { title: 'Kopja', academicYear: '2027/28', copyFromCourseId: seed.course.id },
      }),
    );
    const [lab] = await seed.tenant.labs.ofCourse(copy.id);
    expect((await seed.tenant.notebooks.ofLab(lab?.id as string)).map((n) => n.kind)).toEqual(['main']);
  });

  it('refuses to copy a course the creator cannot see', async () => {
    const { seed, admin, orgPath } = await setup();
    const res = await admin.call(`${orgPath}/courses`, {
      method: 'POST',
      body: { title: 'Copy', academicYear: '2027/28', copyFromCourseId: seed.course.id },
    });
    expect(res.status).toBe(404);
  });
});

describe('groups and join codes', () => {
  it('gives every new group a readable join code, shown only to those who manage its students', async () => {
    const { seed, orgPath } = await setup();
    const pedagog = await account(seed, 'pedagog', { courseId: seed.course.id });
    const created = await pedagog.call(`${orgPath}/courses/${seed.course.id}/groups`, {
      method: 'POST',
      body: { name: 'Grupi B' },
    });
    expect(created.status).toBe(201);
    const group = await json<{ id: string; joinCode: string }>(created);
    expect(group.joinCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/);

    const student = await account(seed, 'student', { groupId: group.id });
    const seen = await json<CourseDetail>(await student.call(`${orgPath}/courses/${seed.course.id}`));
    expect(seen.groups.find((g) => g.id === group.id)).not.toHaveProperty('joinCode');
    expect(seen.permissions.manage).toBe(false);

    const staff = await json<CourseDetail>(await pedagog.call(`${orgPath}/courses/${seed.course.id}`));
    expect(staff.groups.find((g) => g.id === group.id)?.joinCode).toBe(group.joinCode);
  });

  it('lets an assistant switch joining off or make a new code for their group, but not change groups', async () => {
    const { seed, orgPath } = await setup();
    const assistant = await account(seed, 'assistant', { groupId: seed.group.id });
    const base = `${orgPath}/courses/${seed.course.id}/groups/${seed.group.id}`;

    const fresh = await json<{ joinCode: string }>(
      await assistant.call(`${base}/join-code`, { method: 'POST', body: { enabled: true } }),
    );
    expect(fresh.joinCode).toHaveLength(8);
    const off = await json<{ joinCode: null }>(
      await assistant.call(`${base}/join-code`, { method: 'POST', body: { enabled: false } }),
    );
    expect(off.joinCode).toBeNull();

    expect((await assistant.call(base, { method: 'PATCH', body: { name: 'X' } })).status).toBe(403);
    expect((await assistant.call(base, { method: 'DELETE' })).status).toBe(403);
    expect(
      (await assistant.call(`${orgPath}/courses/${seed.course.id}/groups`, { method: 'POST', body: { name: 'C' } }))
        .status,
    ).toBe(403);
  });

  it('answers 404 for a group that is not in the course', async () => {
    const { seed, orgPath } = await setup();
    const pedagog = await account(seed, 'pedagog', { courseId: seed.course.id });
    const other = await seed.tenant.courses.create({ title: 'Other', academicYear: '2026/27' });
    const res = await pedagog.call(`${orgPath}/courses/${other.id}/groups/${seed.group.id}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    const wrongCourse = await pedagog.call(`${orgPath}/courses/${seed.course.id}/groups/not-a-group`, {
      method: 'DELETE',
    });
    expect(wrongCourse.status).toBe(404);
  });
});

describe('joining with a code', () => {
  async function groupWithCode() {
    const ctx = await setup();
    const pedagog = await account(ctx.seed, 'pedagog', { courseId: ctx.seed.course.id });
    const group = await json<{ id: string; joinCode: string }>(
      await pedagog.call(`${ctx.orgPath}/courses/${ctx.seed.course.id}/groups`, {
        method: 'POST',
        body: { name: 'Grupi B' },
      }),
    );
    return { ...ctx, pedagog, group };
  }

  it('makes a student of the group, who then sees the course', async () => {
    const { seed, orgPath, group } = await groupWithCode();
    const newcomer = await account(seed); // an account with no membership here yet
    expect((await newcomer.call(`${orgPath}/courses`)).status).toBe(404);

    // Typed as on a phone: lowercase, with the dash and a stray space.
    const typed = ` ${formatJoinCode(group.joinCode).toLowerCase()}`;
    const res = await newcomer.call('/join', { method: 'POST', body: { code: typed } });
    expect(res.status).toBe(200);
    expect(await json<JoinResult>(res)).toEqual({
      organization: { slug: seed.org.slug, name: seed.org.name },
      course: { id: seed.course.id, title: seed.course.title },
      group: { id: group.id, name: 'Grupi B' },
    });

    const courses = await json<CourseSummary[]>(await newcomer.call(`${orgPath}/courses`));
    expect(courses.map((c) => c.id)).toEqual([seed.course.id]);
    expect((await newcomer.call(`${orgPath}/courses/${seed.course.id}`)).status).toBe(200);

    // Joining again changes nothing.
    expect((await newcomer.call('/join', { method: 'POST', body: { code: group.joinCode } })).status).toBe(200);
    const { results } = await env.DB.prepare('select role, group_id from memberships where user_id = ?')
      .bind(newcomer.user.id)
      .all();
    expect(results).toEqual([{ role: 'student', group_id: group.id }]);
  });

  it('stops working when joining is switched off, the code is replaced, or the course is archived', async () => {
    const { seed, orgPath, pedagog, group } = await groupWithCode();
    const base = `${orgPath}/courses/${seed.course.id}`;
    const student = await account(seed);

    const replaced = await json<{ joinCode: string }>(
      await pedagog.call(`${base}/groups/${group.id}/join-code`, { method: 'POST', body: { enabled: true } }),
    );
    expect((await student.call('/join', { method: 'POST', body: { code: group.joinCode } })).status).toBe(404);

    await pedagog.call(`${base}/groups/${group.id}/join-code`, { method: 'POST', body: { enabled: false } });
    expect((await student.call('/join', { method: 'POST', body: { code: replaced.joinCode } })).status).toBe(404);

    const again = await json<{ joinCode: string }>(
      await pedagog.call(`${base}/groups/${group.id}/join-code`, { method: 'POST', body: { enabled: true } }),
    );
    await pedagog.call(`${base}/archive`, { method: 'POST' });
    expect((await student.call('/join', { method: 'POST', body: { code: again.joinCode } })).status).toBe(404);
  });

  it(`stops guessing after ${MAX_JOIN_FAILURES} wrong codes, even for a right one`, async () => {
    const { seed, group } = await groupWithCode();
    const guesser = await account(seed);
    for (let i = 0; i < MAX_JOIN_FAILURES; i++) {
      expect((await guesser.call('/join', { method: 'POST', body: { code: 'AAAA-AAAA' } })).status).toBe(404);
    }
    const locked = await guesser.call('/join', { method: 'POST', body: { code: group.joinCode } });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('needs a signed-in user', async () => {
    const { group } = await groupWithCode();
    const { caller } = await import('./http');
    expect((await caller()('/join', { method: 'POST', body: { code: group.joinCode } })).status).toBe(401);
  });
});

describe('seeing courses', () => {
  it('shows each person only the courses they belong to, and 404 for the others', async () => {
    const { seed, orgPath } = await setup();
    const other = await seed.tenant.courses.create({ title: 'Matematikë', academicYear: '2026/27' });
    const student = await account(seed, 'student', { groupId: seed.group.id });
    const otherPedagog = await account(seed, 'pedagog', { courseId: other.id });

    expect((await json<CourseSummary[]>(await student.call(`${orgPath}/courses`))).map((c) => c.id)).toEqual([
      seed.course.id,
    ]);
    expect((await json<CourseSummary[]>(await otherPedagog.call(`${orgPath}/courses`))).map((c) => c.id)).toEqual([
      other.id,
    ]);
    expect((await student.call(`${orgPath}/courses/${other.id}`)).status).toBe(404);
    expect((await otherPedagog.call(`${orgPath}/courses/${seed.course.id}`)).status).toBe(404);
  });

  it('keeps other organizations out', async () => {
    const { seed, orgPath } = await setup();
    const elsewhere = await seedOrganization('b');
    const stranger = await account(elsewhere, 'admin');
    expect((await stranger.call(`${orgPath}/courses`)).status).toBe(404);
    expect((await stranger.call(`${orgPath}/courses/${seed.course.id}`)).status).toBe(404);
  });
});

describe('archiving', () => {
  it('ends the year for a course: listed after current ones, still readable, undoable by its pedagog', async () => {
    const { seed, orgPath } = await setup();
    const pedagog = await account(seed, 'pedagog');
    const newer = await seed.tenant.courses.create({ title: 'SDA 2027/28', academicYear: '2027/28' });
    const student = await account(seed, 'student', { groupId: seed.group.id });

    expect((await student.call(`${orgPath}/courses/${seed.course.id}/archive`, { method: 'POST' })).status).toBe(403);
    const archived = await json<CourseSummary>(
      await pedagog.call(`${orgPath}/courses/${seed.course.id}/archive`, { method: 'POST' }),
    );
    expect(archived.archivedAt).not.toBeNull();

    const list = await json<CourseSummary[]>(await pedagog.call(`${orgPath}/courses`));
    expect(list.map((c) => c.id)).toEqual([newer.id, seed.course.id]);
    expect((await student.call(`${orgPath}/courses/${seed.course.id}`)).status).toBe(200);

    const restored = await json<CourseSummary>(
      await pedagog.call(`${orgPath}/courses/${seed.course.id}/unarchive`, { method: 'POST' }),
    );
    expect(restored.archivedAt).toBeNull();
  });
});

describe('deleting a course (#80)', () => {
  it('is for staff who manage it, and takes its groups and labs with it', async () => {
    const seed = await seedOrganization('fshn');
    const pedagog = await account(seed, 'pedagog', { courseId: seed.course.id });
    const assistant = await account(seed, 'assistant', { groupId: seed.group.id });
    const student = await account(seed, 'student', { groupId: seed.group.id });
    const path = `/orgs/${seed.org.slug}/courses/${seed.course.id}`;
    expect((await student.call(path, { method: 'DELETE' })).status).toBe(403);
    expect((await assistant.call(path, { method: 'DELETE' })).status).toBe(403);
    expect((await pedagog.call(path, { method: 'DELETE' })).status).toBe(204);
    expect((await pedagog.call(path)).status).toBe(404);
    expect(await seed.tenant.labs.get(seed.lab.id)).toBeUndefined();
    expect(await seed.tenant.groups.get(seed.group.id)).toBeUndefined();
    expect(await seed.tenant.notebooks.get(seed.notebook.id)).toBeUndefined();
    // The student's account stays, though no longer in this course.
    const account_ = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(student.user.id).first();
    expect(account_).not.toBeNull();
  });
});

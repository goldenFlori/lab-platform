import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src/api/db/tenant';
import type { Assignment, MySubmission, SubmissionDetail, SubmissionList } from '../../src/shared/submissions';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #52 is done when students submit, staff list the submissions per group, and no student can see
// another's work.

// Whole seconds, as the database keeps them.
const at = (seconds: number) => new Date(Math.floor(Date.now() / 1000 + seconds) * 1000).toISOString();

async function setup() {
  const seed = await seedOrganization('fshn');
  const { tenant, course, lab, notebook } = seed;
  const groupB = await tenant.groups.create({ courseId: course.id, name: 'Grupi B' });
  const pedagog = await account(seed, 'pedagog', { courseId: course.id });
  const assistant = await account(seed, 'assistant', { groupId: seed.group.id });
  const assistantB = await account(seed, 'assistant', { groupId: groupB.id });
  const ana = await account(seed, 'student', { groupId: seed.group.id });
  const besa = await account(seed, 'student', { groupId: seed.group.id });
  const cima = await account(seed, 'student', { groupId: groupB.id });
  const labPath = `/orgs/${seed.org.slug}/courses/${course.id}/labs/${lab.id}`;
  const nbPath = `${labPath}/notebooks/${notebook.id}`;
  await pedagog.call(`${labPath}/access`, {
    method: 'PUT',
    body: { groupId: null, visibleFrom: at(-60), visibleUntil: null, solutionsFrom: null },
  });
  await pedagog.call(`${labPath}/access/${seed.group.id}`, { method: 'DELETE' });
  await tenant.exercises.set(notebook.id, [{ cell: 4, title: 'Ushtrimi 1', test: null }]);

  const open = (who: typeof pedagog, groupId: string, dueAt: string) =>
    who.call(`${nbPath}/assignments/${groupId}`, { method: 'PUT', body: { dueAt } });
  const submit = (who: typeof pedagog) => who.call(`${nbPath}/submission`, { method: 'POST' });
  const mine = async (who: typeof pedagog) => (await (await who.call(`${nbPath}/submission`)).json()) as MySubmission;
  const edit = (who: typeof pedagog, cell: number, code: string) =>
    who.call(`${nbPath}/edits/${cell}`, { method: 'PUT', body: { code } });
  const list = (who: typeof pedagog, group?: string) =>
    who.call(`${nbPath}/submissions${group ? `?group=${group}` : ''}`);
  return { seed, groupB, pedagog, assistant, assistantB, ana, besa, cima, nbPath, open, submit, mine, edit, list };
}

describe('opening a notebook for submission', () => {
  it('is for staff who may publish the lab, per group, with a deadline they can move', async () => {
    const { seed, pedagog, assistant, ana, nbPath, open } = await setup();
    expect((await open(ana, seed.group.id, at(3600))).status).toBe(403);
    expect((await open(assistant, seed.group.id, at(3600))).status).toBe(403);
    expect((await open(pedagog, seed.group.id, 'nesër')).status).toBe(400);
    expect((await open(pedagog, seed.group.id, at(3600))).status).toBe(200);
    const later = at(7200);
    await open(pedagog, seed.group.id, later);
    const res = await pedagog.call(`${nbPath}/assignments`);
    expect((await res.json()) as Assignment[]).toEqual([{ groupId: seed.group.id, dueAt: later, kolokium: null }]);
    expect((await ana.call(`${nbPath}/assignments`)).status).toBe(403);
  });

  it('answers 404 for a group outside the course', async () => {
    const { pedagog, open } = await setup();
    expect((await open(pedagog, crypto.randomUUID(), at(3600))).status).toBe(404);
  });
});

describe('handing in work', () => {
  it("copies the student's saved code and solved exercises, and can be repeated until the deadline", async () => {
    const { seed, pedagog, ana, open, submit, mine, edit } = await setup();
    expect(await mine(ana)).toEqual({ dueAt: null, grade: null, open: false, submission: null, kolokium: null });
    expect((await submit(ana)).status).toBe(403);

    const dueAt = at(3600);
    await open(pedagog, seed.group.id, dueAt);
    expect(await mine(ana)).toEqual({ dueAt, grade: null, open: true, submission: null, kolokium: null });
    await edit(ana, 4, 'def shuma(a, b):\n    return a + b');
    await seed.tenant.exercises.complete({ notebookId: seed.notebook.id, cell: 4, userId: ana.user.id });
    const first = await submit(ana);
    expect(first.status).toBe(200);
    expect(((await first.json()) as MySubmission).submission).toMatchObject({ attempts: 1, solved: [4] });

    await edit(ana, 2, 'x = 2');
    expect((await submit(ana)).status).toBe(200);
    expect((await mine(ana)).submission).toMatchObject({ attempts: 2, solved: [4] });
    const stored = await seed.tenant.submissions.of(seed.notebook.id, ana.user.id);
    expect(stored?.code).toEqual([
      { cell: 2, code: 'x = 2' },
      { cell: 4, code: 'def shuma(a, b):\n    return a + b' },
    ]);
  });

  it('is refused after the deadline, and what was handed in stays', async () => {
    const { seed, pedagog, ana, open, submit, mine } = await setup();
    await open(pedagog, seed.group.id, at(3600));
    await submit(ana);
    await open(pedagog, seed.group.id, at(-60));
    const late = await submit(ana);
    expect(late.status).toBe(409);
    expect(await late.json()).toEqual({ error: 'closed' });
    expect(await mine(ana)).toMatchObject({ open: false, submission: { attempts: 1 } });
  });

  it('keeps the work when staff close the submission', async () => {
    const { seed, pedagog, ana, nbPath, open, submit, mine } = await setup();
    await open(pedagog, seed.group.id, at(3600));
    await submit(ana);
    expect((await pedagog.call(`${nbPath}/assignments/${seed.group.id}`, { method: 'DELETE' })).status).toBe(204);
    expect(await mine(ana)).toMatchObject({ dueAt: null, open: false, submission: { attempts: 1 } });
    expect((await submit(ana)).status).toBe(403);
  });

  it("follows the student's own group: another group's deadline does not open it", async () => {
    const { seed, groupB, pedagog, ana, cima, open, submit } = await setup();
    await open(pedagog, groupB.id, at(3600));
    expect((await submit(ana)).status).toBe(403);
    expect((await submit(cima)).status).toBe(200);
    await open(pedagog, seed.group.id, at(3600));
    expect((await submit(ana)).status).toBe(200);
  });

  it('is not for staff', async () => {
    const { seed, pedagog, assistant, open, submit } = await setup();
    await open(pedagog, seed.group.id, at(3600));
    expect((await submit(pedagog)).status).toBe(403);
    expect((await submit(assistant)).status).toBe(403);
  });
});

describe('reading submissions', () => {
  it("lists a group's students with what each handed in, for staff who review the group", async () => {
    const { seed, groupB, pedagog, assistant, ana, open, submit, list } = await setup();
    const dueAt = at(3600);
    await open(pedagog, seed.group.id, dueAt);
    await submit(ana);

    const res = await list(assistant);
    expect(res.status).toBe(200);
    const body = (await res.json()) as SubmissionList;
    expect(body.groups).toEqual([{ id: seed.group.id, name: 'Grupi A', dueAt, kolokium: null }]);
    expect(body.students.map((s) => [s.id, s.submission?.attempts ?? null])).toEqual(
      expect.arrayContaining([
        [ana.user.id, 1],
        [expect.any(String), null],
      ]),
    );
    expect(body.students).toHaveLength(2);
    // An assistant of group A cannot list group B; the pedagog lists both.
    expect((await list(assistant, groupB.id)).status).toBe(403);
    expect(((await (await list(pedagog)).json()) as SubmissionList).groups.map((g) => g.name)).toEqual([
      'Grupi A',
      'Grupi B',
    ]);
  });

  it("shows staff of the student's group the code, and no student sees another's work", async () => {
    const { seed, pedagog, assistantB, ana, besa, nbPath, open, submit, edit, list } = await setup();
    await open(pedagog, seed.group.id, at(3600));
    await edit(ana, 4, 'sekret = 42');
    await submit(ana);

    const res = await pedagog.call(`${nbPath}/submissions/${ana.user.id}`);
    expect(res.status).toBe(200);
    expect((await res.json()) as SubmissionDetail).toMatchObject({
      attempts: 1,
      code: [{ cell: 4, code: 'sekret = 42' }],
    });
    // Besa, a classmate, can read neither the list nor Ana's work.
    expect((await list(besa)).status).toBe(403);
    expect((await besa.call(`${nbPath}/submissions/${ana.user.id}`)).status).toBe(403);
    expect(((await (await besa.call(`${nbPath}/submission`)).json()) as MySubmission).submission).toBeNull();
    // Staff of another group: not their student.
    expect((await assistantB.call(`${nbPath}/submissions/${ana.user.id}`)).status).toBe(404);
  });
});

describe('cross-tenant isolation: submissions', () => {
  it("cannot open, hand in or read another organization's", async () => {
    const a = await seedOrganization('a');
    const b = await seedOrganization('b');
    await b.tenant.submissions.open(b.notebook.id, b.group.id, new Date(Date.now() + 3600_000));
    await b.tenant.submissions.submit({ notebookId: b.notebook.id, userId: b.user.id, code: [], solved: [] });
    expect(await a.tenant.submissions.assignmentsOf(b.notebook.id)).toEqual([]);
    expect(await a.tenant.submissions.of(b.notebook.id, b.user.id)).toBeUndefined();
    await expect(a.tenant.submissions.open(b.notebook.id, a.group.id, new Date())).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(a.tenant.submissions.open(a.notebook.id, b.group.id, new Date())).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      a.tenant.submissions.submit({ notebookId: b.notebook.id, userId: a.user.id, code: [], solved: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await a.tenant.submissions.close(b.notebook.id, b.group.id);
    const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM assignments').first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });
});

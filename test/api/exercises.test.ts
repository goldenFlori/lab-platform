import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../src/api/db/tenant';
import type { ActivityReport } from '../../src/shared/activity';
import type { Exercise, ExerciseProgress } from '../../src/shared/exercises';
import { MAX_TEST } from '../../src/shared/exercises';
import type { NotebookDetail } from '../../src/shared/notebooks';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #51 is done when a student solves an exercise and sees it checked, and the pedagog sees how many
// completed it.

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

const EXERCISES: Exercise[] = [
  { cell: 4, title: 'Ushtrimi 1 — Shuma', test: null },
  { cell: 7, title: 'Ushtrimi 2 — Prodhimi', test: 'assert prodhimi(2, 3) == 6, "prodhimi(2, 3) duhet 6"' },
];

async function setup() {
  const seed = await seedOrganization('fshn');
  const { tenant, course, lab, notebook } = seed;
  const groupB = await tenant.groups.create({ courseId: course.id, name: 'Grupi B' });
  const pedagog = await account(seed, 'pedagog', { courseId: course.id });
  const pedagogB = await account(seed, 'pedagog', { groupId: groupB.id });
  const assistant = await account(seed, 'assistant', { groupId: seed.group.id });
  const ana = await account(seed, 'student', { groupId: seed.group.id });
  const besa = await account(seed, 'student', { groupId: seed.group.id });
  const cima = await account(seed, 'student', { groupId: groupB.id });
  const coursePath = `/orgs/${seed.org.slug}/courses/${course.id}`;
  const labPath = `${coursePath}/labs/${lab.id}`;
  const nbPath = `${labPath}/notebooks/${notebook.id}`;
  for (const groupId of [null, seed.group.id]) {
    await pedagog.call(`${labPath}/access`, {
      method: 'PUT',
      body: { groupId, visibleFrom: ago(60), visibleUntil: null, solutionsFrom: null },
    });
  }
  const set = (who: typeof pedagog, exercises: unknown) =>
    who.call(`${nbPath}/exercises`, { method: 'PUT', body: { exercises } });
  const done = (who: typeof pedagog, cell: number) => who.call(`${nbPath}/exercises/${cell}/done`, { method: 'POST' });
  const progress = async (who: typeof pedagog) =>
    (await (await who.call(`${nbPath}/exercises/progress`)).json()) as ExerciseProgress;
  return { seed, groupB, pedagog, pedagogB, assistant, ana, besa, cima, coursePath, nbPath, set, done, progress };
}

describe("a notebook's exercises", () => {
  it('are set by staff who manage the course and come with the notebook', async () => {
    const { pedagog, assistant, ana, nbPath, set } = await setup();
    expect((await set(ana, EXERCISES)).status).toBe(403);
    expect((await set(assistant, EXERCISES)).status).toBe(403);
    const res = await set(pedagog, EXERCISES);
    expect(res.status).toBe(200);
    // Hints for "Explain my error" unless staff choose otherwise (#86).
    const saved = EXERCISES.map((e) => ({ ...e, ai: 'hints' }));
    expect(((await res.json()) as NotebookDetail).exercises).toEqual(saved);
    expect(((await (await ana.call(nbPath)).json()) as NotebookDetail).exercises).toEqual(saved);
    // Replaced as a whole.
    await set(pedagog, [{ ...EXERCISES[1], ai: 'off' }]);
    expect(((await (await ana.call(nbPath)).json()) as NotebookDetail).exercises).toEqual([
      { ...EXERCISES[1], ai: 'off' },
    ]);
  });

  it('refuse a list that is not one exercise per cell, a title missing or a test too long', async () => {
    const { pedagog, set } = await setup();
    expect((await set(pedagog, [EXERCISES[0], { ...EXERCISES[1], cell: 4 }])).status).toBe(400);
    expect((await set(pedagog, [{ cell: 1, title: ' ', test: null }])).status).toBe(400);
    expect((await set(pedagog, [{ cell: 1, title: 'X', test: 'x'.repeat(MAX_TEST + 1) }])).status).toBe(400);
  });
});

describe('completed exercises', () => {
  it("are kept once for the student, and staff's own are not kept", async () => {
    const { pedagog, ana, besa, set, done, progress } = await setup();
    await set(pedagog, EXERCISES);
    expect((await done(ana, 7)).status).toBe(204);
    expect((await done(ana, 7)).status).toBe(204);
    expect((await done(ana, 4)).status).toBe(204);
    expect((await progress(ana)).done).toEqual([4, 7]);
    expect((await progress(besa)).done).toEqual([]);
    expect((await done(pedagog, 4)).status).toBe(204);
    expect((await progress(pedagog)).done).toEqual([]);
  });

  it('must be exercises of a notebook the user may read', async () => {
    const { seed, pedagog, ana, nbPath, set, done } = await setup();
    await set(pedagog, EXERCISES);
    expect((await done(ana, 5)).status).toBe(404);
    expect((await ana.call(`${nbPath}/exercises/abc/done`, { method: 'POST' })).status).toBe(400);
    const outsider = await account(seed);
    expect((await done(outsider, 4)).status).toBe(404);
  });

  it('show staff with analytics how many of their students completed each, and only counts', async () => {
    const { pedagog, pedagogB, assistant, ana, besa, cima, set, done, progress } = await setup();
    await set(pedagog, EXERCISES);
    await done(ana, 4);
    await done(ana, 7);
    await done(besa, 4);
    await done(cima, 4);

    expect(await progress(pedagog)).toEqual({
      done: [],
      counts: [
        { cell: 4, students: 3 },
        { cell: 7, students: 1 },
      ],
      students: 3,
      // Fewer than five students: no hint counts (#215).
      hints: null,
    });
    // A pedagog of group B counts only group B.
    expect(await progress(pedagogB)).toEqual({
      done: [],
      counts: [{ cell: 4, students: 1 }],
      students: 1,
      hints: null,
    });
    // Assistants and students see no counts.
    expect((await progress(assistant)).counts).toBeNull();
    expect(await progress(ana)).toEqual({ done: [4, 7], counts: null, students: null, hints: null });
  });

  it('count only exercises the notebook still has', async () => {
    const { pedagog, ana, set, done, progress } = await setup();
    await set(pedagog, EXERCISES);
    await done(ana, 4);
    await set(pedagog, [EXERCISES[1]]);
    expect((await progress(pedagog)).counts).toEqual([]);
  });

  it('count in the course activity, once a day per student and lab', async () => {
    const { pedagog, ana, coursePath, set, done } = await setup();
    await set(pedagog, EXERCISES);
    await done(ana, 4);
    await done(ana, 7);
    const exerciseRows = async () =>
      (await env.DB.prepare("SELECT COUNT(*) AS n FROM lab_activity WHERE kind = 'exercise'").first<{ n: number }>())
        ?.n;
    await vi.waitFor(async () => expect(await exerciseRows()).toBe(1));
    const report = (await (await pedagog.call(`${coursePath}/activity`)).json()) as ActivityReport;
    expect(report.labs[0]?.exercise).toBe(1);
    expect(report.weeks.at(-1)?.exercise).toBe(1);
  });
});

describe('cross-tenant isolation: exercises', () => {
  it("cannot set, complete or count another organization's", async () => {
    const a = await seedOrganization('a');
    const b = await seedOrganization('b');
    await b.tenant.exercises.set(b.notebook.id, [{ cell: 1, title: 'B', test: null }]);
    await b.tenant.exercises.complete({ notebookId: b.notebook.id, cell: 1, userId: b.user.id });
    expect(await a.tenant.exercises.of(b.notebook.id)).toEqual([]);
    expect(await a.tenant.exercises.doneBy(b.notebook.id, b.user.id)).toEqual([]);
    expect(
      (await a.tenant.exercises.counts({ notebookId: b.notebook.id, courseId: b.course.id, groupIds: null })).counts,
    ).toEqual([]);
    await expect(a.tenant.exercises.set(b.notebook.id, [{ cell: 1, title: 'A', test: null }])).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      a.tenant.exercises.complete({ notebookId: b.notebook.id, cell: 1, userId: a.user.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await b.tenant.exercises.of(b.notebook.id)).toHaveLength(1);
  });
});

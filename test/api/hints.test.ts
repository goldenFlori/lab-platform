import { describe, expect, it } from 'vitest';
import type { ExerciseProgress, RevealedHint } from '../../src/shared/exercises';
import type { NotebookDetail } from '../../src/shared/notebooks';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #215: staff write up to three hints for an exercise; students reveal them in order, never during a
// kolokium; staff see how many students revealed each, only from five students up.

const at = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
const HINTS = ['Mendo për radhën.', 'Përdor deque.', 'Shto fqinjët pa i vizituar dy herë.'];

async function setup(students = 1, slug = 'fshn') {
  const seed = await seedOrganization(slug);
  const { course, lab, notebook, group } = seed;
  const pedagog = await account(seed, 'pedagog', { courseId: course.id });
  const coursePath = `/orgs/${seed.org.slug}/courses/${course.id}`;
  const nbPath = `${coursePath}/labs/${lab.id}/notebooks/${notebook.id}`;
  // Open for the course and for the group, whose own rule (in the seed: hidden) wins.
  for (const groupId of [null, group.id])
    await pedagog.call(`${coursePath}/labs/${lab.id}/access`, {
      method: 'PUT',
      body: { groupId, visibleFrom: at(-3600), visibleUntil: null, solutionsFrom: null },
    });
  const saved = await pedagog.call(`${nbPath}/exercises`, {
    method: 'PUT',
    body: { exercises: [{ cell: 3, title: 'BFS', test: null, hints: HINTS }] },
  });
  expect(saved.status).toBe(200);
  const learners: Awaited<ReturnType<typeof account>>[] = [];
  for (let i = 0; i < students; i++) learners.push(await account(seed, 'student', { groupId: group.id }));
  const reveal = (who: (typeof learners)[number], hint: number) =>
    who.call(`${nbPath}/exercises/3/hints/${hint}`, { method: 'POST' });
  return { seed, pedagog, learners, nbPath, coursePath, reveal };
}

describe('hints written by the pedagog', () => {
  it('reach students one at a time, in order, and stay revealed for them', async () => {
    const { pedagog, learners, nbPath, reveal } = await setup();
    const [ana] = learners as [(typeof learners)[number]];
    // Staff get the text; a student only how many there are.
    const forStaff = (await (await pedagog.call(nbPath)).json()) as NotebookDetail;
    expect(forStaff.exercises[0]).toMatchObject({ cell: 3, hints: HINTS });
    const forAna = (await (await ana.call(nbPath)).json()) as NotebookDetail;
    expect(forAna.exercises[0]).toMatchObject({ cell: 3, hintCount: 3 });
    expect(forAna.exercises[0]?.hints).toBeUndefined();

    expect((await reveal(ana, 2)).status).toBe(409);
    expect(await (await reveal(ana, 1)).json()).toEqual({ cell: 3, hint: 1, text: HINTS[0] });
    expect((await reveal(ana, 1)).status).toBe(200);
    expect((await reveal(ana, 2)).status).toBe(200);
    expect((await reveal(ana, 4)).status).toBe(404);
    const mine = (await (await ana.call(`${nbPath}/hints`)).json()) as { hints: RevealedHint[] };
    expect(mine.hints.map((h) => [h.hint, h.text])).toEqual([
      [1, HINTS[0]],
      [2, HINTS[1]],
    ]);
  });

  it('are counted for staff, only from five students up, and never for staff themselves', async () => {
    const small = await setup(2, 'small');
    await small.reveal(small.learners[0] as never, 1);
    const few = (await (await small.pedagog.call(`${small.nbPath}/exercises/progress`)).json()) as ExerciseProgress;
    expect(few.hints).toBeNull();

    const { pedagog, learners, nbPath, reveal } = await setup(5);
    for (const who of learners.slice(0, 3)) await reveal(who, 1);
    await reveal(learners[0] as never, 2);
    expect((await reveal(pedagog as never, 3)).status).toBe(200);
    const progress = (await (await pedagog.call(`${nbPath}/exercises/progress`)).json()) as ExerciseProgress;
    expect(progress.hints).toEqual([
      { cell: 3, hint: 1, students: 3 },
      { cell: 3, hint: 2, students: 1 },
    ]);
  });

  it('are closed while a kolokium runs for the student’s group', async () => {
    const { seed, pedagog, learners, nbPath, reveal } = await setup();
    await pedagog.call(`${nbPath}/assignments/${seed.group.id}`, {
      method: 'PUT',
      body: { dueAt: at(7200), kolokium: { opensAt: at(-60), minutes: 30 } },
    });
    const ana = learners[0] as never;
    await (ana as (typeof learners)[number]).call(`${nbPath}/kolokium/start`, { method: 'POST' });
    expect((await reveal(ana, 1)).status).toBe(403);
  });

  it("go with the student's data: in My data, and erased with them", async () => {
    const { seed, learners, reveal } = await setup();
    const ana = learners[0] as (typeof learners)[number];
    await reveal(ana, 1);
    expect((await seed.tenant.personal.export(ana.user.id)).hintsRevealed).toMatchObject([{ cell: 3, hint: 1 }]);
    await seed.tenant.personal.erase(ana.user.id, new Date(), seed.user.id);
    expect((await seed.tenant.personal.export(ana.user.id)).hintsRevealed).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { MyProgress } from '../../src/shared/progress';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #99 is done when a student with a solved exercise, a submission and a released grade sees all
// three on "My progress", and another student sees only their own.

const at = (seconds: number) => new Date(Math.floor(Date.now() / 1000 + seconds) * 1000).toISOString();

describe('My progress', () => {
  it("shows a student their own exercises, submission and released grade, and nobody else's", async () => {
    const seed = await seedOrganization('fshn');
    const { course, lab, notebook, group } = seed;
    const pedagog = await account(seed, 'pedagog', { courseId: course.id });
    const ana = await account(seed, 'student', { groupId: group.id });
    const besa = await account(seed, 'student', { groupId: group.id });
    const coursePath = `/orgs/${seed.org.slug}/courses/${course.id}`;
    const nbPath = `${coursePath}/labs/${lab.id}/notebooks/${notebook.id}`;
    for (const groupId of [null, group.id]) {
      await pedagog.call(`${coursePath}/labs/${lab.id}/access`, {
        method: 'PUT',
        body: { groupId, visibleFrom: at(-60), visibleUntil: null, solutionsFrom: null },
      });
    }
    await pedagog.call(`${nbPath}/exercises`, {
      method: 'PUT',
      body: {
        exercises: [
          { cell: 4, title: 'Ushtrimi 1', test: null },
          { cell: 7, title: 'Ushtrimi 2', test: null },
        ],
      },
    });
    const due = at(3600);
    await pedagog.call(`${nbPath}/assignments/${group.id}`, { method: 'PUT', body: { dueAt: due } });

    await ana.call(nbPath); // opens the lab
    await ana.call(`${nbPath}/exercises/4/done`, { method: 'POST' });
    await ana.call(`${nbPath}/submission`, { method: 'POST' });
    await pedagog.call(`${nbPath}/grades/${ana.user.id}`, {
      method: 'PUT',
      body: { autoScore: 1, maxScore: 2, results: [{ cell: 4, status: 'pass' }] },
    });
    await pedagog.call(`${nbPath}/grades/${ana.user.id}`, { method: 'PATCH', body: { score: 2, feedback: 'Mirë.' } });
    await pedagog.call(`${nbPath}/grades/release?group=${group.id}`, { method: 'POST' });

    const progress = async (who: typeof ana) => (await (await who.call(`${coursePath}/progress`)).json()) as MyProgress;
    const mine = await progress(ana);
    expect(mine.labs).toHaveLength(1);
    expect(mine.labs[0]).toMatchObject({ id: lab.id, opened: true });
    expect(mine.labs[0]?.notebooks[0]).toMatchObject({
      id: notebook.id,
      exercises: 2,
      solved: 1,
      dueAt: due,
      submittedAt: expect.any(String),
      grade: { score: 2, maxScore: 2, feedback: 'Mirë.' },
    });

    expect((await progress(besa)).labs[0]).toMatchObject({
      opened: false,
      notebooks: [{ solved: 0, submittedAt: null, grade: null }],
    });
    const outsider = await account(seed);
    expect((await outsider.call(`${coursePath}/progress`)).status).toBe(404);
  });
});

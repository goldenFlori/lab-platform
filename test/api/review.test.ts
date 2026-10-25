import { describe, expect, it, vi } from 'vitest';
import type { ReviewPlan } from '../../src/shared/review';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #152: the review session asks about the algorithms of the labs a student has opened.

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

async function setup() {
  const seed = await seedOrganization('fshn');
  const { course, lab, notebook } = seed;
  const pedagog = await account(seed, 'pedagog', { courseId: course.id });
  const ana = await account(seed, 'student', { groupId: seed.group.id });
  const coursePath = `/orgs/${seed.org.slug}/courses/${course.id}`;
  const labPath = `${coursePath}/labs/${lab.id}`;
  const nbPath = `${labPath}/notebooks/${notebook.id}`;
  for (const groupId of [null, seed.group.id]) {
    await pedagog.call(`${labPath}/access`, {
      method: 'PUT',
      body: { groupId, visibleFrom: ago(60), visibleUntil: null, solutionsFrom: null },
    });
  }
  await pedagog.call(`${nbPath}/embeds`, {
    method: 'PUT',
    body: {
      embeds: [
        { cell: 3, viz: 'tabela-gjurmimit', title: 'Prim', props: { preset: 'lab05-prim' } },
        { cell: 6, viz: 'kruskal-prim', title: null, props: null },
        { cell: 9, viz: 'kompleksiteti', title: null, props: null },
      ],
    },
  });
  const plan = async (who: typeof pedagog) => (await (await who.call(`${coursePath}/review`)).json()) as ReviewPlan;
  return { seed, pedagog, ana, coursePath, nbPath, plan };
}

describe('the review plan', () => {
  it('has the topics of the labs the student opened, with the first lab teaching each, and their results', async () => {
    const { seed, ana, nbPath, plan } = await setup();
    expect((await plan(ana)).topics).toEqual([]);
    // Opening the lab's notebook counts as opening the lab.
    await ana.call(nbPath);
    await vi.waitFor(async () => expect((await plan(ana)).topics).toHaveLength(2));
    const { topics } = await plan(ana);
    expect(topics.map((t) => t.topic)).toEqual(['prim', 'kruskal']);
    expect(topics[0]).toMatchObject({ labId: seed.lab.id, lab: seed.lab.n, labTitle: seed.lab.title });
    await ana.call(`${nbPath}/embeds/3/results`, {
      method: 'POST',
      body: { topic: 'trace-prim', decision: 'lab05-prim:0', right: true, pick: '', answer: '', prompt: 'P' },
    });
    expect((await plan(ana)).results).toEqual([{ topic: 'trace-prim', asked: 1, right: 1 }]);
  });

  it('gives staff every lab, and outsiders nothing', async () => {
    const { seed, pedagog, coursePath, plan } = await setup();
    expect((await plan(pedagog)).topics.map((t) => t.topic)).toEqual(['prim', 'kruskal']);
    const outsider = await account(seed);
    expect((await outsider.call(`${coursePath}/review`)).status).toBe(404);
  });
});

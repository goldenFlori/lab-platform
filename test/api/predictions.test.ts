import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src/api/db/tenant';
import type { PredictionInput, UnderstandingReport } from '../../src/shared/predictions';
import type { MyProgress } from '../../src/shared/progress';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #151 is done when a student's first answers to the decisions of embedded visualizations are kept,
// they see their own accuracy per topic, and staff with analytics see the hardest decisions as counts
// from five students up, never names.

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

const answer = (over: Partial<PredictionInput> = {}): PredictionInput => ({
  topic: 'prim',
  decision: '3:abc',
  right: false,
  pick: 'B–C (5)',
  answer: 'C–E (2)',
  prompt: 'Prim: pema ka {A, C}. Cila brinjë hyn tani në pemë?',
  ...over,
});

async function setup() {
  const seed = await seedOrganization('fshn');
  const { tenant, course, lab, notebook } = seed;
  const groupB = await tenant.groups.create({ courseId: course.id, name: 'Grupi B' });
  const pedagog = await account(seed, 'pedagog', { courseId: course.id });
  const pedagogB = await account(seed, 'pedagog', { groupId: groupB.id });
  const assistant = await account(seed, 'assistant', { groupId: seed.group.id });
  const coursePath = `/orgs/${seed.org.slug}/courses/${course.id}`;
  const labPath = `${coursePath}/labs/${lab.id}`;
  const nbPath = `${labPath}/notebooks/${notebook.id}`;
  for (const groupId of [null, seed.group.id, groupB.id]) {
    await pedagog.call(`${labPath}/access`, {
      method: 'PUT',
      body: { groupId, visibleFrom: ago(60), visibleUntil: null, solutionsFrom: null },
    });
  }
  await pedagog.call(`${nbPath}/embeds`, {
    method: 'PUT',
    body: {
      embeds: [
        { cell: 3, viz: 'tabela-gjurmimit', title: 'Prim me dorë', props: { preset: 'lab05-prim' } },
        { cell: 6, viz: 'kruskal-prim', title: 'Kruskal', props: null },
      ],
    },
  });
  const send = (who: typeof pedagog, body: unknown, cell = 3) =>
    who.call(`${nbPath}/embeds/${cell}/results`, { method: 'POST', body });
  const topics = async (who: typeof pedagog) =>
    ((await (await who.call(`${coursePath}/progress`)).json()) as MyProgress).topics;
  const report = (who: typeof pedagog, group?: string) =>
    who.call(`${coursePath}/understanding${group ? `?group=${group}` : ''}`);
  return { seed, groupB, pedagog, pedagogB, assistant, nbPath, send, topics, report };
}

describe('first-try results', () => {
  it("keep a student's first answer to each decision, and never staff's", async () => {
    const { seed, pedagog, send, topics } = await setup();
    const ana = await account(seed, 'student', { groupId: seed.group.id });
    expect((await send(ana, answer())).status).toBe(204);
    // Trying again, now right, changes nothing: it is the first try that counts.
    expect((await send(ana, answer({ right: true, pick: 'C–E (2)' }))).status).toBe(204);
    expect((await send(ana, answer({ decision: '5:def', right: true }))).status).toBe(204);
    expect((await send(ana, answer({ topic: 'trace-prim', decision: 'lab05-prim:0', right: true }))).status).toBe(204);
    expect(await topics(ana)).toEqual([
      { topic: 'prim', asked: 2, right: 1 },
      { topic: 'trace-prim', asked: 1, right: 1 },
    ]);
    expect((await send(pedagog, answer())).status).toBe(204);
    expect(await topics(pedagog)).toEqual([]);
  });

  it('must belong to an embed of a notebook the user may read', async () => {
    const { seed, send } = await setup();
    const ana = await account(seed, 'student', { groupId: seed.group.id });
    expect((await send(ana, answer(), 4)).status).toBe(404);
    expect((await send(ana, { ...answer(), topic: 'magic' })).status).toBe(400);
    expect((await send(ana, { ...answer(), decision: 'x'.repeat(121) })).status).toBe(400);
    const outsider = await account(seed);
    expect((await send(outsider, answer())).status).toBe(404);
  });

  it('show staff with analytics the hardest decisions from five students up, as counts only', async () => {
    const { seed, groupB, pedagog, pedagogB, assistant, send, report } = await setup();
    const picks = ['B–C (5)', 'B–C (5)', 'B–C (5)', 'A–B (6)', null];
    const students = [];
    for (const pick of picks) {
      const student = await account(seed, 'student', { groupId: seed.group.id });
      students.push(student);
      await send(student, answer(pick ? { pick } : { right: true, pick: 'C–E (2)' }));
      // A second decision everyone gets right, and one on an embed with too few students to show.
      await send(student, answer({ decision: '5:def', right: true }));
    }
    const cima = await account(seed, 'student', { groupId: groupB.id });
    await send(cima, answer());
    await send(cima, answer({ topic: 'kruskal', decision: '2:x' }), 6);

    const res = await report(pedagog);
    expect(res.status).toBe(200);
    const body = (await res.json()) as UnderstandingReport;
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0]).toMatchObject({
      cell: 3,
      viz: 'tabela-gjurmimit',
      title: 'Prim me dorë',
      topics: ['prim'],
      students: 6,
      answers: 11,
      right: 6,
    });
    // Only the decision students got wrong, with the wrong answer most of them gave.
    expect(body.embeds[0]?.hardest).toEqual([
      {
        prompt: answer().prompt,
        answer: 'C–E (2)',
        students: 6,
        right: 1,
        wrong: { pick: 'B–C (5)', students: 4 },
      },
    ]);
    const text = JSON.stringify(body);
    for (const s of [...students, cima]) {
      expect(text).not.toContain(s.user.id);
      expect(text).not.toContain(s.user.username);
    }

    // A group of one student shows nothing; a group they may not see is refused.
    expect(((await (await report(pedagogB)).json()) as UnderstandingReport).embeds).toEqual([]);
    expect((await report(pedagogB, seed.group.id)).status).toBe(403);
    expect(((await (await report(pedagog, seed.group.id)).json()) as UnderstandingReport).embeds[0]?.students).toBe(5);
    // Without analytics: assistants and students are refused.
    expect((await report(assistant)).status).toBe(403);
    expect((await report(students[0] as typeof pedagog)).status).toBe(403);
  });

  it("are in the student's own data, and erased with them", async () => {
    const { seed, send } = await setup();
    const ana = await account(seed, 'student', { groupId: seed.group.id });
    await send(ana, answer());
    const mine = await seed.tenant.personal.export(ana.user.id);
    expect(mine.firstTries).toEqual([
      expect.objectContaining({ cell: 3, topic: 'prim', pick: 'B–C (5)', correct: false }),
    ]);
    await seed.tenant.personal.erase(ana.user.id, new Date(), seed.user.id);
    expect((await seed.tenant.personal.export(ana.user.id)).firstTries).toEqual([]);
  });
});

describe('cross-tenant isolation: first-try results', () => {
  it("cannot record or read another organization's", async () => {
    const a = await seedOrganization('a');
    const b = await seedOrganization('b');
    const row = { ...answer(), notebookId: b.notebook.id, cell: 3, day: '2026-10-25' };
    await b.tenant.predictions.record({ ...row, userId: b.user.id });
    await expect(a.tenant.predictions.record({ ...row, userId: a.user.id })).rejects.toBeInstanceOf(NotFoundError);
    expect(await a.tenant.predictions.ofStudent(b.course.id, b.user.id)).toEqual([]);
    const seen = await a.tenant.predictions.report({ courseId: b.course.id, groupIds: null });
    expect([...seen.perEmbed, ...seen.perDecision, ...seen.wrong, ...seen.perTopic]).toEqual([]);
    expect(await b.tenant.predictions.ofStudent(b.course.id, b.user.id)).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import { startOfDay, today } from '../../src/api/routes/activity';
import type { PilotReport } from '../../src/shared/activity';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #101 is done when, after simulated activity, the report shows each number for the period, and
// staff without analytics rights are refused.

const at = (seconds: number) => new Date(Math.floor(Date.now() / 1000 + seconds) * 1000).toISOString();

describe('the pilot report', () => {
  it("counts the period's activity of the groups the user may see, and only for staff with analytics", async () => {
    const seed = await seedOrganization('fshn');
    const { tenant, course, lab, notebook, group } = seed;
    const groupB = await tenant.groups.create({ courseId: course.id, name: 'Grupi B' });
    const pedagog = await account(seed, 'pedagog', { courseId: course.id });
    const pedagogB = await account(seed, 'pedagog', { groupId: groupB.id });
    const ana = await account(seed, 'student', { groupId: group.id });
    const besa = await account(seed, 'student', { groupId: group.id });
    await account(seed, 'student', { groupId: groupB.id });
    const coursePath = `/orgs/${seed.org.slug}/courses/${course.id}`;
    const labPath = `${coursePath}/labs/${lab.id}`;
    const nbPath = `${labPath}/notebooks/${notebook.id}`;
    for (const groupId of [null, group.id]) {
      await pedagog.call(`${labPath}/access`, {
        method: 'PUT',
        body: { groupId, visibleFrom: at(-60), visibleUntil: null, solutionsFrom: null },
      });
    }
    await pedagog.call(`${nbPath}/exercises`, {
      method: 'PUT',
      body: { exercises: [{ cell: 4, title: 'Ushtrimi 1', test: null }] },
    });
    await pedagog.call(`${nbPath}/assignments/${group.id}`, { method: 'PUT', body: { dueAt: at(3600) } });

    // Ana opens the lab, runs code, takes part in a Live Lab, solves, hands in and asks the AI.
    await ana.call(nbPath);
    expect((await ana.call(`${labPath}/activity`, { method: 'POST', body: { kind: 'run' } })).status).toBe(204);
    await tenant.activity.record({ labId: lab.id, userId: ana.user.id, kind: 'live', day: today() });
    await ana.call(`${nbPath}/exercises/4/done`, { method: 'POST' });
    await ana.call(`${nbPath}/submission`, { method: 'POST' });
    const question = { courseId: course.id, notebookId: notebook.id, userId: ana.user.id, cell: 4 };
    await tenant.ai.ask({ ...question, code: 'x', error: 'NameError', answer: 'Shiko rreshtin 1.' });
    await tenant.ai.record({
      courseId: course.id,
      userId: ana.user.id,
      day: new Date().toISOString().slice(0, 10),
      requests: 2,
      neurons: 30,
    });
    // Besa only opens it.
    await besa.call(nbPath);

    const report = (who: typeof ana, query = '') => who.call(`${coursePath}/report${query}`);
    const whole = (await (await report(pedagog)).json()) as PilotReport;
    expect(whole).toMatchObject({
      students: 3,
      active: 2,
      labsOpened: { students: 2, total: 2 },
      codeRuns: { students: 1, total: 1 },
      liveLabs: { students: 1, total: 1 },
      exercisesCompleted: { students: 1, total: 1 },
      submissions: { students: 1, total: 1 },
      aiQuestions: { students: 1, total: 1 },
      aiRequests: 2,
    });
    expect(whole.weeks.at(-1)?.active).toBe(2);

    // A pedagog of group B sees only group B.
    expect(await (await report(pedagogB)).json()).toMatchObject({ students: 1, active: 0, group: null });
    expect((await report(ana)).status).toBe(403);
    expect((await report(pedagog, '?from=2026-10-12&to=2026-01-01')).status).toBe(400);
    expect((await report(pedagog, '?from=2025-01-01&to=2026-10-12')).status).toBe(400);
  });
});

// #153: the report shows learning, not only use: first-try accuracy per topic and week, and whether
// it rises after a student's first day, from five students up.
describe("the pilot report's learning", () => {
  it('counts first tries per topic and week, and the first day against the later ones', async () => {
    const seed = await seedOrganization('fshn');
    const { tenant, course, notebook, group } = seed;
    const pedagog = await account(seed, 'pedagog', { courseId: course.id });
    const now = today();
    const before = new Date(`${now}T12:00:00Z`);
    before.setUTCDate(before.getUTCDate() - 1);
    const yesterday = before.toISOString().slice(0, 10);
    const answer = (
      userId: string,
      day: string,
      topic: 'bfs' | 'prim' | 'trace-prim',
      decision: string,
      right: boolean,
    ) =>
      tenant.predictions.record({
        notebookId: notebook.id,
        cell: 1,
        userId,
        day,
        topic,
        decision,
        right,
        pick: 'X',
        answer: 'Y',
        prompt: 'P',
      });
    // Five students: BFS wrong on their first day, right the next.
    for (let i = 0; i < 5; i++) {
      const student = await account(seed, 'student', { groupId: group.id });
      await answer(student.user.id, yesterday, 'bfs', 'a', false);
      await answer(student.user.id, now, 'bfs', 'b', true);
      // One of them also tries Prim and a trace table: too few to show per topic.
      if (i === 0) {
        await answer(student.user.id, now, 'prim', 'c', true);
        await answer(student.user.id, now, 'trace-prim', 'lab05-prim:0', false);
      }
    }
    const res = await pedagog.call(`/orgs/${seed.org.slug}/courses/${course.id}/report?from=${yesterday}&to=${now}`);
    const { understanding } = (await res.json()) as PilotReport;
    expect(understanding).toMatchObject({
      students: 5,
      answers: 12,
      right: 6,
      topics: [{ topic: 'bfs', students: 5, answers: 10, right: 5 }],
      growth: { students: 5, firstDay: { answers: 5, right: 0 }, later: { answers: 7, right: 6 } },
      traceRows: { students: 1, total: 1 },
    });
    const weeks = understanding.weeks;
    expect(weeks.reduce((n, w) => n + w.answers, 0)).toBe(12);
    expect(weeks.reduce((n, w) => n + w.right, 0)).toBe(6);
  });
});

// #112: the period runs from Tirana's midnight, not UTC's, so late-evening work is counted.
describe("the institution's days", () => {
  it('begin at midnight in Tirana, in summer and in winter time', () => {
    expect(startOfDay('2026-10-13').toISOString()).toBe('2026-10-12T22:00:00.000Z');
    expect(startOfDay('2026-12-01').toISOString()).toBe('2026-11-30T23:00:00.000Z');
    // The days the clocks change.
    expect(startOfDay('2026-03-29').toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(startOfDay('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z');
    // Something done at 00:30 Tirana time belongs to that day, and to its period.
    const lateEvening = new Date('2026-10-12T22:30:00Z');
    expect(today(lateEvening)).toBe('2026-10-13');
    expect(lateEvening >= startOfDay('2026-10-13')).toBe(true);
  });
});

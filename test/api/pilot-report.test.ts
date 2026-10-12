import { describe, expect, it } from 'vitest';
import { today } from '../../src/api/routes/activity';
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

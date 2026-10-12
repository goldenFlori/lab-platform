import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { mondayOf, today } from '../../src/api/routes/activity';
import type { ActivityReport } from '../../src/shared/activity';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #18 is done when the pedagog sees weekly activity for their course: counts of students, for the
// groups they may see, with staff never counted and no student named.

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

async function rows() {
  return (await env.DB.prepare('select count(*) as n from lab_activity').first<{ n: number }>())?.n ?? 0;
}

async function setup() {
  const seed = await seedOrganization('fshn');
  const { tenant, course, lab, notebook } = seed;
  const groupB = await tenant.groups.create({ courseId: course.id, name: 'Grupi B' });
  const pedagog = await account(seed, 'pedagog', { courseId: course.id });
  const pedagogB = await account(seed, 'pedagog', { groupId: groupB.id });
  const assistant = await account(seed, 'assistant', { groupId: seed.group.id });
  const studentA = await account(seed, 'student', { groupId: seed.group.id });
  const studentB = await account(seed, 'student', { groupId: groupB.id });
  const coursePath = `/orgs/${seed.org.slug}/courses/${course.id}`;
  const labPath = `${coursePath}/labs/${lab.id}`;
  const nbPath = `${labPath}/notebooks/${notebook.id}`;
  await tenant.notebooks.putFile(notebook.id, 'notebook.ipynb', {
    mime: 'application/x-ipynb+json',
    encoding: 'identity',
    data: new TextEncoder().encode('{"cells": []}'),
  });
  // Open for the course, and for group A, whose own rule (hidden, from the seed) would win.
  for (const groupId of [null, seed.group.id]) {
    await pedagog.call(`${labPath}/access`, {
      method: 'PUT',
      body: { groupId, visibleFrom: ago(60), visibleUntil: null, solutionsFrom: null },
    });
  }
  const report = async (who: typeof pedagog, group?: string) => {
    const res = await who.call(`${coursePath}/activity${group ? `?group=${group}` : ''}`);
    return { status: res.status, body: res.status === 200 ? ((await res.json()) as ActivityReport) : null };
  };
  /** Opens the notebook, downloads it and uses a visualization, then waits for the writes. */
  const work = async (who: typeof pedagog, expectRows: number) => {
    expect((await who.call(nbPath)).status).toBe(200);
    expect((await who.call(`${nbPath}/files/notebook.ipynb`)).status).toBe(200);
    expect((await who.call(`${labPath}/activity`, { method: 'POST', body: { kind: 'visualization' } })).status).toBe(
      204,
    );
    await vi.waitFor(async () => expect(await rows()).toBe(expectRows));
  };
  return { seed, groupB, pedagog, pedagogB, assistant, studentA, studentB, coursePath, labPath, report, work };
}

describe('recording learning activity', () => {
  it("records a student's views, downloads and visualizations once a day, and never staff", async () => {
    const { pedagog, studentA, work } = await setup();
    await work(studentA, 3);
    await work(studentA, 3);
    await work(pedagog, 3);
    // Give a staff write, had there been one, time to land.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await rows()).toBe(3);
  });

  it('refuses activity for a lab the student cannot see', async () => {
    const { seed, studentA, coursePath } = await setup();
    const hidden = await seed.tenant.labs.create({ courseId: seed.course.id, n: 2, title: 'Fshehur', position: 2 });
    const res = await studentA.call(`${coursePath}/labs/${hidden.id}/activity`, {
      method: 'POST',
      body: { kind: 'visualization' },
    });
    expect(res.status).toBe(404);
    expect(
      (await studentA.call(`${coursePath}/labs/${seed.lab.id}/activity`, { method: 'POST', body: { kind: 'view' } }))
        .status,
    ).toBe(400);
  });
});

describe('the activity report', () => {
  it('shows staff weekly counts of students for the whole course, without names', async () => {
    const { seed, pedagog, studentA, studentB, report, work } = await setup();
    await work(studentA, 3);
    expect(
      (await studentB.call(`/orgs/fshn/courses/${seed.course.id}/labs/${seed.lab.id}/notebooks/${seed.notebook.id}`))
        .status,
    ).toBe(200);
    await vi.waitFor(async () => expect(await rows()).toBe(4));

    const { status, body } = await report(pedagog);
    expect(status).toBe(200);
    expect(body?.students).toBe(2);
    expect(body?.groups.map((g) => g.name)).toEqual(['Grupi A', 'Grupi B']);
    expect(body?.weeks.at(-1)).toEqual({
      week: mondayOf(today()),
      active: 2,
      view: 2,
      download: 1,
      visualization: 1,
      exercise: 0,
      run: 0,
      live: 0,
    });
    expect(body?.labs).toEqual([
      { id: seed.lab.id, n: 1, title: 'Grafet', view: 2, download: 1, visualization: 1, exercise: 0, run: 0, live: 0 },
    ]);
    const text = JSON.stringify(body);
    for (const who of [studentA, studentB]) {
      expect(text).not.toContain(who.user.id);
      expect(text).not.toContain(who.user.username);
    }
  });

  it('shows a pedagog of one group only that group, and only one group when asked', async () => {
    const { seed, groupB, pedagog, pedagogB, studentA, report, work } = await setup();
    await work(studentA, 3);
    const onlyB = await report(pedagogB);
    expect(onlyB.body).toMatchObject({ students: 1, groups: [{ id: groupB.id, name: 'Grupi B' }] });
    expect(onlyB.body?.weeks.at(-1)?.active).toBe(0);
    expect((await report(pedagogB, seed.group.id)).status).toBe(403);
    const onlyA = await report(pedagog, seed.group.id);
    expect(onlyA.body).toMatchObject({ group: seed.group.id, students: 1 });
    expect(onlyA.body?.weeks.at(-1)?.active).toBe(1);
  });

  it('counts each week from Monday, from the week the course began', async () => {
    const { seed, studentA, pedagog, report } = await setup();
    const day = (weeksAgo: number) => {
      const date = new Date(`${mondayOf(today())}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() - 7 * weeksAgo + 2);
      return date.toISOString().slice(0, 10);
    };
    // The course began three weeks ago; one row is older than that and must not count.
    const began = Math.floor(new Date(`${day(3)}T12:00:00Z`).getTime() / 1000);
    await env.DB.prepare('update courses set created_at = ? where id = ?').bind(began, seed.course.id).run();
    for (const [weeksAgo, kind] of [
      [2, 'view'],
      [2, 'download'],
      [5, 'view'],
    ] as const) {
      await seed.tenant.activity.record({ labId: seed.lab.id, userId: studentA.user.id, kind, day: day(weeksAgo) });
    }
    const weeks = (await report(pedagog)).body?.weeks ?? [];
    expect(weeks.map((w) => w.week)).toEqual([3, 2, 1, 0].map((n) => mondayOf(day(n))));
    expect(weeks.map((w) => w.active)).toEqual([0, 1, 0, 0]);
    expect(weeks[1]).toMatchObject({ view: 1, download: 1, visualization: 0 });
  });

  it('is for staff with analytics: not assistants or students, and 404 outside the course', async () => {
    const { seed, assistant, studentA, report } = await setup();
    expect((await report(assistant)).status).toBe(403);
    expect((await report(studentA)).status).toBe(403);
    expect((await report(await account(seed))).status).toBe(404);
    expect((await report(await account(await seedOrganization('other'), 'pedagog'))).status).toBe(404);
  });
});

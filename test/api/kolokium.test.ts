import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src/api/db/tenant';
import type { LabList } from '../../src/shared/labs';
import type { Assignment, Kolokium, MySubmission, SubmissionList } from '../../src/shared/submissions';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #169 is done when a kolokium opens to a group for a window, each student's clock starts when they
// do, it is handed in once, and while it runs their other labs are hidden and AI help is off.

const at = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

async function setup(opensIn = -60, minutes = 30) {
  const seed = await seedOrganization('fshn');
  const { tenant, course, lab, notebook, group } = seed;
  const other = await tenant.labs.create({ courseId: course.id, n: 2, title: 'Rrugët', position: 2 });
  const pedagog = await account(seed, 'pedagog', { courseId: course.id });
  const ana = await account(seed, 'student', { groupId: group.id });
  const coursePath = `/orgs/${seed.org.slug}/courses/${course.id}`;
  const labPath = `${coursePath}/labs/${lab.id}`;
  const nbPath = `${labPath}/notebooks/${notebook.id}`;
  for (const l of [lab, other])
    for (const groupId of [null, group.id])
      await pedagog.call(`${coursePath}/labs/${l.id}/access`, {
        method: 'PUT',
        body: { groupId, visibleFrom: at(-3600), visibleUntil: null, solutionsFrom: null },
      });
  const assign = (body: unknown) => pedagog.call(`${nbPath}/assignments/${group.id}`, { method: 'PUT', body });
  const res = await assign({ dueAt: at(7200), kolokium: { opensAt: at(opensIn), minutes } });
  expect(res.status).toBe(200);
  const start = () => ana.call(`${nbPath}/kolokium/start`, { method: 'POST' });
  const mine = async () => (await (await ana.call(`${nbPath}/submission`)).json()) as MySubmission;
  return { seed, other, pedagog, ana, coursePath, labPath, nbPath, assign, start, mine };
}

describe('a kolokium', () => {
  it('is set per group with a window, and refused when it cannot be taken', async () => {
    const { pedagog, nbPath, assign } = await setup();
    const list = (await (await pedagog.call(`${nbPath}/assignments`)).json()) as Assignment[];
    expect(list[0]?.kolokium?.minutes).toBe(30);
    expect((await assign({ dueAt: at(60), kolokium: { opensAt: at(120), minutes: 30 } })).status).toBe(400);
    expect((await assign({ dueAt: at(7200), kolokium: { opensAt: at(60), minutes: 2 } })).status).toBe(400);
    // A plain deadline again: the window goes.
    expect(((await (await assign({ dueAt: at(7200) })).json()) as Assignment).kolokium).toBeNull();
  });

  it('cannot be read or started before it opens', async () => {
    const { ana, labPath, nbPath, start } = await setup(600);
    expect((await ana.call(nbPath)).status).toBe(404);
    expect((await start()).status).toBe(409);
    // The lab still says it is coming, so the page can show when.
    const lab = (await (await ana.call(labPath)).json()) as { kolokia?: Kolokium[] };
    expect(lab.kolokia?.[0]).toMatchObject({ minutes: 30, startedAt: null });
  });

  it('starts the student clock, hides the other labs and AI help, and is handed in once', async () => {
    const { other, ana, coursePath, nbPath, start, mine } = await setup();
    // Running: only its lab is open to the group, and its notebook stays closed until the start.
    const labs = (await (await ana.call(`${coursePath}/labs`)).json()) as LabList;
    expect(labs.labs.map((l) => l.n)).toEqual([1]);
    expect((await ana.call(`${coursePath}/labs/${other.id}`)).status).toBe(404);
    expect((await ana.call(nbPath)).status).toBe(404);

    const started = (await (await start()).json()) as Kolokium;
    expect(started.startedAt).not.toBeNull();
    expect(Date.parse(started.endsAt ?? '') - Date.parse(started.startedAt ?? '')).toBe(30 * 60_000);
    expect((await ana.call(nbPath)).status).toBe(200);
    // Starting again keeps the first start.
    expect(((await (await start()).json()) as Kolokium).startedAt).toBe(started.startedAt);

    const explain = await ana.call(`${nbPath}/explain`, {
      method: 'POST',
      body: { cell: 1, code: 'x', error: 'NameError', context: '' },
    });
    expect(explain.status).toBe(403);

    expect(await mine()).toMatchObject({ open: true, kolokium: { startedAt: started.startedAt } });
    expect((await ana.call(`${nbPath}/submission`, { method: 'POST' })).status).toBe(200);
    expect((await mine()).open).toBe(false);
    expect((await ana.call(`${nbPath}/submission`, { method: 'POST' })).status).toBe(409);
  });

  it("closes at the student's own end, before the due time", async () => {
    const { ana, nbPath, start, mine } = await setup(-3600, 10);
    await start();
    // Their 10 minutes are over: nothing more is accepted.
    await env.DB.prepare('update kolokium_starts set started_at = ?')
      .bind(seconds(new Date(Date.now() - 11 * 60_000)))
      .run();
    expect((await mine()).open).toBe(false);
    expect((await ana.call(`${nbPath}/submission`, { method: 'POST' })).status).toBe(409);
  });

  it('shows staff who started and who handed in', async () => {
    const { pedagog, ana, nbPath, start } = await setup();
    await start();
    const list = (await (await pedagog.call(`${nbPath}/submissions`)).json()) as SubmissionList;
    expect(list.groups[0]?.kolokium?.minutes).toBe(30);
    const row = list.students.find((s) => s.id === ana.user.id);
    expect(row?.startedAt).not.toBeNull();
    expect(row?.submission).toBeNull();
    // Staff see every lab and the notebook throughout.
    expect((await pedagog.call(nbPath)).status).toBe(200);
  });
});

describe('cross-tenant isolation: kolokium starts', () => {
  it("cannot start another organization's", async () => {
    const a = await seedOrganization('a');
    const b = await seedOrganization('b');
    await expect(a.tenant.submissions.start(b.notebook.id, a.user.id, new Date())).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await a.tenant.submissions.startsOf(b.notebook.id)).toEqual([]);
    expect(await a.tenant.submissions.kolokiaFor(b.course.id, [b.group.id], b.user.id)).toEqual([]);
  });
});

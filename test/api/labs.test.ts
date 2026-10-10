import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { LabList, LabView } from '../../src/shared/labs';
import { seedOrganization } from './fixtures';
import { account } from './http';

const json = async <T>(res: Response) => (await res.json()) as T;
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
const later = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

async function setup() {
  const seed = await seedOrganization('fshn');
  // The fixture's lab already has a hidden rule of its own for Grupi A.
  const groupB = await seed.tenant.groups.create({ courseId: seed.course.id, name: 'Grupi B' });
  const pedagog = await account(seed, 'pedagog', { courseId: seed.course.id });
  const assistant = await account(seed, 'assistant', { groupId: seed.group.id });
  const studentA = await account(seed, 'student', { groupId: seed.group.id });
  const studentB = await account(seed, 'student', { groupId: groupB.id });
  const labs = `/orgs/${seed.org.slug}/courses/${seed.course.id}/labs`;
  const lab = `${labs}/${seed.lab.id}`;
  const setRule = (body: object) => pedagog.call(`${lab}/access`, { method: 'PUT', body });
  return { seed, groupB, pedagog, assistant, studentA, studentB, labs, lab, setRule };
}

const titles = async (res: Response) => (await json<LabList>(res)).labs.map((l) => l.title);
const rule = (groupId: string | null, r: Record<string, string | null> = {}) => ({
  groupId,
  visibleFrom: null,
  visibleUntil: null,
  solutionsFrom: null,
  ...r,
});

describe('lab visibility', () => {
  it('keeps labs hidden from students until opened, including by direct link', async () => {
    const { studentA, studentB, pedagog, labs, lab } = await setup();
    expect(await titles(await studentA.call(labs))).toEqual([]);
    expect(await titles(await studentB.call(labs))).toEqual([]);
    expect((await studentA.call(lab)).status).toBe(404);
    expect((await studentB.call(lab)).status).toBe(404);

    const staff = await json<LabList>(await pedagog.call(labs));
    expect(staff.labs[0]?.visibility?.course).toBe('hidden');
    expect(staff.permissions).toEqual({ manage: true, publish: true, staff: true });
  });

  it("opens a lab at once for the course, while a group's own rule wins until removed", async () => {
    const { seed, studentA, studentB, pedagog, labs, lab, setRule } = await setup();
    expect((await setRule(rule(null, { visibleFrom: ago(1) }))).status).toBe(200);

    expect(await titles(await studentB.call(labs))).toEqual(['Grafet']);
    expect((await studentB.call(lab)).status).toBe(200);
    expect(await titles(await studentA.call(labs))).toEqual([]); // Grupi A still has its own hidden rule

    const states = (await json<LabList>(await pedagog.call(labs))).labs[0]?.visibility;
    expect(states?.groups.find((g) => g.groupId === seed.group.id)).toEqual({
      groupId: seed.group.id,
      state: 'hidden',
      ownRule: true,
    });

    expect((await pedagog.call(`${lab}/access/${seed.group.id}`, { method: 'DELETE' })).status).toBe(200);
    expect(await titles(await studentA.call(labs))).toEqual(['Grafet']);
  });

  it('hides a lab again at once', async () => {
    const { studentB, lab, labs, setRule } = await setup();
    await setRule(rule(null, { visibleFrom: ago(1) }));
    expect((await studentB.call(lab)).status).toBe(200);
    await setRule(rule(null));
    expect((await studentB.call(lab)).status).toBe(404);
    expect(await titles(await studentB.call(labs))).toEqual([]);
  });

  it('opens a scheduled lab when its time comes, and closes it after visibleUntil', async () => {
    const { seed, studentB, pedagog, labs, lab, setRule } = await setup();
    await setRule(rule(null, { visibleFrom: later(3600) }));
    expect((await studentB.call(lab)).status).toBe(404);
    expect((await json<LabList>(await pedagog.call(labs))).labs[0]?.visibility?.course).toBe('scheduled');

    // An hour passes.
    await env.DB.prepare('update lab_access set visible_from = visible_from - 7200 where lab_id = ?')
      .bind(seed.lab.id)
      .run();
    expect((await studentB.call(lab)).status).toBe(200);

    await setRule(rule(null, { visibleFrom: ago(7200), visibleUntil: ago(60) }));
    expect((await studentB.call(lab)).status).toBe(404);
    expect((await json<LabList>(await pedagog.call(labs))).labs[0]?.visibility?.course).toBe('closed');
  });

  it('shows solutions to students only from solutionsFrom on, and to staff always', async () => {
    const { studentB, assistant, lab, setRule } = await setup();
    await setRule(rule(null, { visibleFrom: ago(60), solutionsFrom: later(3600) }));
    expect((await json<LabView>(await studentB.call(lab))).solutionsAvailable).toBe(false);
    expect((await json<LabView>(await assistant.call(lab))).solutionsAvailable).toBe(true);
    await setRule(rule(null, { visibleFrom: ago(60), solutionsFrom: ago(1) }));
    expect((await json<LabView>(await studentB.call(lab))).solutionsAvailable).toBe(true);
  });

  it('lets assistants see hidden labs to prepare, but only pedagogs change who sees them', async () => {
    const { seed, assistant, studentB, lab, labs } = await setup();
    expect(await titles(await assistant.call(labs))).toEqual(['Grafet']);
    expect((await assistant.call(lab)).status).toBe(200);
    const body = rule(seed.group.id, { visibleFrom: ago(1) });
    expect((await assistant.call(`${lab}/access`, { method: 'PUT', body })).status).toBe(403);
    expect((await studentB.call(`${lab}/access`, { method: 'PUT', body })).status).toBe(404); // hidden from them
  });

  it('refuses rules for groups of other courses and windows that end before they start', async () => {
    const { seed, setRule } = await setup();
    const other = await seed.tenant.courses.create({ title: 'Other', academicYear: '2026/27' });
    const stranger = await seed.tenant.groups.create({ courseId: other.id, name: 'X' });
    expect((await setRule(rule(stranger.id, { visibleFrom: ago(1) }))).status).toBe(404);
    expect((await setRule(rule(null, { visibleFrom: later(60), visibleUntil: ago(60) }))).status).toBe(400);
    expect((await setRule(rule(null, { visibleFrom: 'next monday' }))).status).toBe(400);
  });
});

describe('managing labs', () => {
  it('lets a pedagog add, rename and remove labs, in order', async () => {
    const { pedagog, studentB, labs } = await setup();
    const created = await pedagog.call(labs, { method: 'POST', body: { n: 0, title: 'Hyrje', week: 1 } });
    expect(created.status).toBe(201);
    const intro = await json<LabView>(created);
    expect(intro).toMatchObject({ n: 0, title: 'Hyrje', week: 1, summary: null });
    expect(await titles(await pedagog.call(labs))).toEqual(['Hyrje', 'Grafet']);

    expect(
      (await pedagog.call(`${labs}/${intro.id}`, { method: 'PATCH', body: { title: 'Hyrje në Python', n: 5 } })).status,
    ).toBe(200);
    expect(await titles(await pedagog.call(labs))).toEqual(['Grafet', 'Hyrje në Python']);

    expect((await studentB.call(labs, { method: 'POST', body: { n: 9, title: 'X' } })).status).toBe(403);
    expect((await pedagog.call(`${labs}/${intro.id}`, { method: 'DELETE' })).status).toBe(204);
    expect(await titles(await pedagog.call(labs))).toEqual(['Grafet']);
  });

  it('refuses labs of another course through this course', async () => {
    const { seed, pedagog, labs } = await setup();
    const other = await seed.tenant.courses.create({ title: 'Other', academicYear: '2026/27' });
    const foreign = await seed.tenant.labs.create({ courseId: other.id, n: 1, title: 'X', position: 1 });
    expect((await pedagog.call(`${labs}/${foreign.id}`)).status).toBe(404);
    expect((await pedagog.call(`${labs}/${foreign.id}`, { method: 'DELETE' })).status).toBe(404);
  });
});

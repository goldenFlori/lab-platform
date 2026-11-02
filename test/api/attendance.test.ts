import { describe, expect, it } from 'vitest';
import type { GroupAttendance } from '../../src/shared/attendance';
import type { MyProgress } from '../../src/shared/progress';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #222: a lab hour's register per group, filled in from who opened the lab that day; staff of the
// group change any mark; students see their own.

const DAY = '2026-10-12';

async function setup() {
  const seed = await seedOrganization('fshn');
  const { tenant, course, group, lab } = seed;
  const pedagog = await account(seed, 'pedagog', { courseId: course.id });
  const assistant = await account(seed, 'assistant', { groupId: group.id });
  const ana = await account(seed, 'student', { groupId: group.id });
  const besa = await account(seed, 'student', { groupId: group.id });
  const otherGroup = await tenant.groups.create({ courseId: course.id, name: 'Grupi B' });
  const outsider = await account(seed, 'assistant', { groupId: otherGroup.id });
  // Ana opened the lab that day; Besa did not.
  await tenant.activity.record({ labId: lab.id, userId: ana.user.id, kind: 'view', day: DAY });
  const path = `/orgs/fshn/courses/${course.id}/groups/${group.id}/attendance`;
  const list = async (who = pedagog) => (await (await who.call(path)).json()) as GroupAttendance;
  return { seed, pedagog, assistant, ana, besa, outsider, path, list };
}

describe('attendance for a lab hour', () => {
  it('starts from who opened the lab that day, and staff of the group change any mark', async () => {
    const { seed, assistant, ana, besa, path, list } = await setup();
    const res = await assistant.call(path, { method: 'POST', body: { day: DAY, labId: seed.lab.id } });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const marks = (await list()).marks.filter((m) => m.sessionId === id);
    const statusOf = (userId: string) => marks.find((m) => m.userId === userId)?.status;
    expect(statusOf(ana.user.id)).toBe('present');
    expect(statusOf(besa.user.id)).toBe('absent');
    expect((await list()).sessions.find((s) => s.id === id)).toMatchObject({ day: DAY, label: '1. Grafet' });

    const mark = (userId: string, status: string) =>
      assistant.call(`${path}/${id}/marks/${userId}`, { method: 'PUT', body: { status } });
    expect((await mark(besa.user.id, 'excused')).status).toBe(204);
    expect((await list()).marks.find((m) => m.sessionId === id && m.userId === besa.user.id)?.status).toBe('excused');
    // Only students of the group, and only known statuses.
    expect((await mark(assistant.user.id, 'present')).status).toBe(404);
    expect((await mark(ana.user.id, 'late')).status).toBe(400);

    // The student sees their own marks.
    const progress = (await (await ana.call(`/orgs/fshn/courses/${seed.course.id}/progress`)).json()) as MyProgress;
    expect(progress.attendance).toEqual([{ day: DAY, label: '1. Grafet', status: 'present' }]);
    expect((await seed.tenant.personal.export(besa.user.id)).attendance).toMatchObject([
      { group: 'Grupi A', day: DAY, status: 'excused' },
    ]);
    await seed.tenant.personal.erase(besa.user.id, new Date(), seed.user.id);
    expect((await list()).marks.some((m) => m.userId === besa.user.id)).toBe(false);
  });

  it('is for staff who manage the group, not its students nor other groups', async () => {
    const { seed, ana, outsider, pedagog, path } = await setup();
    const body = { day: DAY, labId: seed.lab.id };
    expect((await ana.call(path)).status).toBe(403);
    expect((await ana.call(path, { method: 'POST', body })).status).toBe(403);
    expect((await outsider.call(path)).status).toBe(403);
    // Only a lab of this course names a register.
    const elsewhere = await seed.tenant.courses.create({ title: 'Tjetër', academicYear: '2026/27' });
    const lab = await seed.tenant.labs.create({ courseId: elsewhere.id, n: 1, title: 'X', position: 1 });
    expect((await pedagog.call(path, { method: 'POST', body: { day: DAY, labId: lab.id } })).status).toBe(404);
  });
});

import { describe, expect, it } from 'vitest';
import type { NotebookDetail, NotebookSummary } from '../../src/shared/notebooks';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #233: a notebook renamed, made another kind, and the lab's notebooks reordered, in place.

const at = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

async function setup() {
  const seed = await seedOrganization('fshn');
  const { tenant, course, lab, group } = seed;
  const pedagog = await account(seed, 'pedagog', { courseId: course.id });
  const assistant = await account(seed, 'assistant', { groupId: group.id });
  const student = await account(seed, 'student', { groupId: group.id });
  const extra = await tenant.notebooks.create({
    labId: lab.id,
    kind: 'extra',
    title: 'Ushtrime shtesë',
    position: 2,
    originalName: 'shtese.ipynb',
    sha256: '1'.repeat(64),
    readyAt: new Date(),
  });
  const labPath = `/orgs/fshn/courses/${course.id}/labs/${lab.id}`;
  for (const groupId of [null, group.id])
    await pedagog.call(`${labPath}/access`, {
      method: 'PUT',
      body: { groupId, visibleFrom: at(-3600), visibleUntil: null, solutionsFrom: null },
    });
  const list = async (who = pedagog) =>
    ((await (await who.call(`${labPath}/notebooks`)).json()) as { notebooks: NotebookSummary[] }).notebooks;
  return { seed, pedagog, assistant, student, extra, labPath, list };
}

describe('notebooks changed in place', () => {
  it('are renamed and made another kind, keeping their id', async () => {
    const { seed, pedagog, student, extra, labPath, list } = await setup();
    const res = await pedagog.call(`${labPath}/notebooks/${extra.id}`, {
      method: 'PATCH',
      body: { title: 'Zgjidhjet e javës', kind: 'solution' },
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as NotebookDetail).toMatchObject({
      id: extra.id,
      title: 'Zgjidhjet e javës',
      kind: 'solution',
    });
    // A solution now: hidden from the student until its date, which this lab does not have.
    expect((await list(student)).map((n) => n.id)).toEqual([seed.notebook.id]);
    expect(
      (await pedagog.call(`${labPath}/notebooks/${extra.id}`, { method: 'PATCH', body: { kind: 'x' } })).status,
    ).toBe(400);
  });

  it('are put in a new order, every one of them once', async () => {
    const { seed, pedagog, extra, labPath, list } = await setup();
    const order = (ids: string[]) => pedagog.call(`${labPath}/notebooks/order`, { method: 'PUT', body: { ids } });
    expect((await order([extra.id, seed.notebook.id])).status).toBe(200);
    expect((await list()).map((n) => n.id)).toEqual([extra.id, seed.notebook.id]);
    expect((await order([extra.id])).status).toBe(400);
    expect((await order([extra.id, extra.id])).status).toBe(400);
  });

  it('are for staff who manage the course', async () => {
    const { assistant, extra, labPath } = await setup();
    expect(
      (await assistant.call(`${labPath}/notebooks/${extra.id}`, { method: 'PATCH', body: { title: 'X' } })).status,
    ).toBe(403);
    expect(
      (await assistant.call(`${labPath}/notebooks/order`, { method: 'PUT', body: { ids: [extra.id] } })).status,
    ).toBe(403);
  });
});

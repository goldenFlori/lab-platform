import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src/api/db/tenant';
import type { CodeEdit } from '../../src/shared/code-edits';
import { MAX_CODE } from '../../src/shared/code-edits';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #49 is done when a student's edits survive a reload and another device, and staff cannot read them.

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

async function setup() {
  const seed = await seedOrganization('fshn');
  const pedagog = await account(seed, 'pedagog', { courseId: seed.course.id });
  const ana = await account(seed, 'student', { groupId: seed.group.id });
  const besa = await account(seed, 'student', { groupId: seed.group.id });
  const labPath = `/orgs/fshn/courses/${seed.course.id}/labs/${seed.lab.id}`;
  const edits = `${labPath}/notebooks/${seed.notebook.id}/edits`;
  await pedagog.call(`${labPath}/access`, {
    method: 'PUT',
    body: { groupId: seed.group.id, visibleFrom: ago(60), visibleUntil: null, solutionsFrom: null },
  });
  const list = async (who: typeof ana) => ((await (await who.call(edits)).json()) as { edits: CodeEdit[] }).edits;
  const save = (who: typeof ana, cell: number, code: string) =>
    who.call(`${edits}/${cell}`, { method: 'PUT', body: { code } });
  return { seed, pedagog, ana, besa, labPath, edits, list, save };
}

describe("a student's own code", () => {
  it('is saved per cell, replaced as it changes, and comes back on any device', async () => {
    const { ana, list, save } = await setup();
    expect(await list(ana)).toEqual([]);
    expect((await save(ana, 3, 'print(1)')).status).toBe(200);
    expect((await save(ana, 1, 'x = 2')).status).toBe(200);
    expect((await save(ana, 3, 'print(2)')).status).toBe(200);
    expect((await list(ana)).map(({ cell, code }) => ({ cell, code }))).toEqual([
      { cell: 1, code: 'x = 2' },
      { cell: 3, code: 'print(2)' },
    ]);
  });

  it('goes back to the original, one cell or the whole notebook', async () => {
    const { ana, edits, list, save } = await setup();
    await save(ana, 1, 'a');
    await save(ana, 2, 'b');
    expect((await ana.call(`${edits}/1`, { method: 'DELETE' })).status).toBe(204);
    expect((await list(ana)).map((e) => e.cell)).toEqual([2]);
    expect((await ana.call(edits, { method: 'DELETE' })).status).toBe(204);
    expect(await list(ana)).toEqual([]);
  });

  it('is private: another student and the staff see only their own', async () => {
    const { ana, besa, pedagog, list, save } = await setup();
    await save(ana, 1, 'sekret = 42');
    await save(pedagog, 1, 'shembull = 1');
    expect(await list(besa)).toEqual([]);
    expect((await list(pedagog)).map((e) => e.code)).toEqual(['shembull = 1']);
    expect((await list(ana)).map((e) => e.code)).toEqual(['sekret = 42']);
  });

  it('needs a notebook the user may read, a real cell number and code within the limit', async () => {
    const { seed, ana, edits, save } = await setup();
    const outsider = await account(seed);
    expect((await outsider.call(edits)).status).toBe(404);
    expect((await save(ana, -1, 'x')).status).toBe(400);
    expect((await ana.call(`${edits}/abc`, { method: 'PUT', body: { code: 'x' } })).status).toBe(400);
    expect((await save(ana, 1, 'x'.repeat(MAX_CODE + 1))).status).toBe(400);
  });
});

describe('cross-tenant isolation: code edits', () => {
  it("cannot read or write another organization's notebook", async () => {
    const a = await seedOrganization('a');
    const b = await seedOrganization('b');
    await b.tenant.codeEdits.save({ notebookId: b.notebook.id, userId: b.user.id, cell: 1, code: 'b' });
    expect(await a.tenant.codeEdits.ofUser(b.notebook.id, b.user.id)).toEqual([]);
    await expect(
      a.tenant.codeEdits.save({ notebookId: b.notebook.id, userId: a.user.id, cell: 1, code: 'a' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await a.tenant.codeEdits.reset(b.notebook.id, b.user.id);
    expect(await b.tenant.codeEdits.ofUser(b.notebook.id, b.user.id)).toHaveLength(1);
  });
});

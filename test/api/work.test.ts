import { describe, expect, it } from 'vitest';
import type { CodeEdit, WorkSaved } from '../../src/shared/code-edits';
import type { TraceAnswers } from '../../src/shared/trace-answers';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #177: a student's changes since their last save go in one request, code and graded trace rows
// together; the rows only while the notebook is open to them, and what it cannot keep is named.

const at = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

async function setup() {
  const seed = await seedOrganization('fshn');
  const { course, lab, notebook, group } = seed;
  const pedagog = await account(seed, 'pedagog', { courseId: course.id });
  const ana = await account(seed, 'student', { groupId: group.id });
  const labPath = `/orgs/${seed.org.slug}/courses/${course.id}/labs/${lab.id}`;
  const nbPath = `${labPath}/notebooks/${notebook.id}`;
  for (const groupId of [null, group.id]) {
    await pedagog.call(`${labPath}/access`, {
      method: 'PUT',
      body: { groupId, visibleFrom: at(-60), visibleUntil: null, solutionsFrom: null },
    });
  }
  await pedagog.call(`${nbPath}/embeds`, {
    method: 'PUT',
    body: {
      embeds: [
        { cell: 3, viz: 'tabela-gjurmimit', props: { preset: 'lab05-prim', points: 10 } },
        { cell: 7, viz: 'tabela-gjurmimit', props: { preset: 'lab05-kruskal' } },
      ],
    },
  });
  const save = async (who: typeof ana, body: unknown) => {
    const res = await who.call(`${nbPath}/work`, { method: 'PUT', body });
    return { status: res.status, body: res.ok ? ((await res.json()) as WorkSaved) : null };
  };
  const edits = async (who: typeof ana) =>
    ((await (await who.call(`${nbPath}/edits`)).json()) as { edits: CodeEdit[] }).edits.map((e) => [e.cell, e.code]);
  const rows = async (who: typeof ana) =>
    ((await (await who.call(`${nbPath}/embeds/3/trace`)).json()) as TraceAnswers).rows;
  const open = () => pedagog.call(`${nbPath}/assignments/${group.id}`, { method: 'PUT', body: { dueAt: at(3600) } });
  return { pedagog, ana, nbPath, save, edits, rows, open };
}

const ROWS = [{ edge: 'A-C', total: '1' }];

describe('saving work in one request', () => {
  it('saves several code cells at once, and puts originals back', async () => {
    const { ana, save, edits } = await setup();
    const first = await save(ana, {
      code: [
        { cell: 1, code: 'x = 1' },
        { cell: 2, code: 'y = 2' },
      ],
      traces: [],
    });
    expect(first).toMatchObject({ status: 200, body: { refused: [] } });
    expect(await edits(ana)).toEqual([
      [1, 'x = 1'],
      [2, 'y = 2'],
    ]);
    await save(ana, {
      code: [
        { cell: 1, code: null },
        { cell: 2, code: 'y = 3' },
      ],
      traces: [],
    });
    expect(await edits(ana)).toEqual([[2, 'y = 3']]);
  });

  it('keeps graded trace rows only while the notebook is open to the student, and the code always', async () => {
    const { pedagog, ana, nbPath, save, edits, rows, open } = await setup();
    const work = { code: [{ cell: 1, code: 'x = 1' }], traces: [{ cell: 3, rows: ROWS }] };
    expect((await save(ana, work)).body?.refused).toEqual([3]);
    expect(await edits(ana)).toEqual([[1, 'x = 1']]);
    expect(await rows(ana)).toEqual([]);

    await open();
    // A practice table (no points) is never kept.
    expect((await save(ana, { code: [], traces: [...work.traces, { cell: 7, rows: ROWS }] })).body?.refused).toEqual([
      7,
    ]);
    expect(await rows(ana)).toEqual(ROWS);
    // Staff practise; nothing of theirs is kept.
    expect((await save(pedagog, work)).body?.refused).toEqual([3]);

    // What was saved this way is what is handed in.
    expect((await ana.call(`${nbPath}/submission`, { method: 'POST' })).status).toBe(200);
  });

  it('refuses more cells than one batch holds, and a cell twice', async () => {
    const { ana, save } = await setup();
    const many = Array.from({ length: 21 }, (_, cell) => ({ cell, code: 'x' }));
    expect((await save(ana, { code: many, traces: [] })).status).toBe(400);
    const twice = [
      { cell: 1, code: 'a' },
      { cell: 1, code: 'b' },
    ];
    expect((await save(ana, { code: twice, traces: [] })).status).toBe(400);
  });
});

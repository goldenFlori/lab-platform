import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src/api/db/tenant';
import type { StaffGrade } from '../../src/shared/grading';
import { PLAIN_WORDS, traceOf } from '../../src/shared/trace';
import type { TraceAnswers } from '../../src/shared/trace-answers';
import { variantProblem, variantSeed } from '../../src/shared/trace-problem';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #168 is done when a graded trace table's rows are saved while its notebook is open, handed in with
// it, and scored by the server from the problem the student had, never from what the browser says.

const at = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
const RUN = { autoScore: 0, maxScore: 0, results: [] };
const VARIANT = { algorithm: 'kruskal', nodes: 5, directed: false } as const;

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
  const embeds = await pedagog.call(`${nbPath}/embeds`, {
    method: 'PUT',
    body: {
      embeds: [
        { cell: 3, viz: 'tabela-gjurmimit', props: { preset: 'lab05-prim', points: 10 } },
        { cell: 5, viz: 'tabela-gjurmimit', props: { variant: VARIANT, points: 6 } },
        { cell: 7, viz: 'tabela-gjurmimit', props: { preset: 'lab05-kruskal' } },
      ],
    },
  });
  expect(embeds.status).toBe(200);
  const trace = (who: typeof ana, cell: number) => who.call(`${nbPath}/embeds/${cell}/trace`);
  const save = (who: typeof ana, cell: number, rows: unknown) =>
    who.call(`${nbPath}/embeds/${cell}/trace`, { method: 'PUT', body: { rows } });
  const open = () => pedagog.call(`${nbPath}/assignments/${group.id}`, { method: 'PUT', body: { dueAt: at(3600) } });
  const grade = async () =>
    (await (await pedagog.call(`${nbPath}/grades/${ana.user.id}`, { method: 'PUT', body: RUN })).json()) as StaffGrade;
  return { seed, pedagog, ana, nbPath, trace, save, open, grade };
}

// Prim from A on Lab 5's graph: A–C 1, C–E 3, C–D 7, D–B 10. The last row's total is wrong.
const PRIM = [
  { edge: 'a-c', total: '1' },
  { edge: 'C–E', total: '3' },
  { edge: 'CD', total: '7' },
  { edge: 'B-D', total: '99' },
];

describe('graded trace tables', () => {
  it('save rows only while their notebook is open to the student, and never for staff', async () => {
    const { pedagog, ana, trace, save, open } = await setup();
    expect((await trace(ana, 7)).status).toBe(404);
    expect(await (await trace(ana, 3)).json()).toEqual({ rows: [], open: false, staff: false, points: 10 });
    expect((await save(ana, 3, PRIM)).status).toBe(403);
    await open();
    expect(((await (await trace(ana, 3)).json()) as TraceAnswers).open).toBe(true);
    expect((await save(ana, 3, PRIM)).status).toBe(204);
    expect(((await (await trace(ana, 3)).json()) as TraceAnswers).rows).toEqual(PRIM);
    expect((await save(pedagog, 3, PRIM)).status).toBe(403);
    expect(((await (await trace(pedagog, 3)).json()) as TraceAnswers).staff).toBe(true);
    expect((await save(ana, 7, PRIM)).status).toBe(404);
    expect((await save(ana, 3, [{ edge: 'x'.repeat(25) }])).status).toBe(400);
  });

  it('are handed in with the notebook and scored by the server, variants included', async () => {
    const { seed, ana, nbPath, save, open, grade } = await setup();
    await open();
    await save(ana, 3, PRIM);
    // Ana's own variant, answered right in full from its expected table.
    const mine = variantProblem(VARIANT, variantSeed(ana.user.id, seed.notebook.id, 5));
    const expected = traceOf(mine, PLAIN_WORDS).rows.map((r) => r.cells);
    await save(ana, 5, expected);
    expect((await ana.call(`${nbPath}/submission`, { method: 'POST' })).status).toBe(200);

    const graded = await grade();
    expect(graded.traces).toEqual([
      { cell: 3, rows: 4, right: 3, points: 10, score: 8 },
      { cell: 5, rows: expected.length, right: expected.length, points: 6, score: 6 },
    ]);
    expect(graded).toMatchObject({ autoScore: 14, maxScore: 16 });

    // What counts is what was handed in: rows saved afterwards change nothing until handed in again.
    await save(
      ana,
      3,
      PRIM.map((r) => ({ ...r, total: '99' })),
    );
    expect((await grade()).traces[0]).toMatchObject({ right: 3, score: 8 });
    // And another student's answers for Ana's variant are wrong for hers.
    const other = variantProblem(VARIANT, variantSeed('someone-else', seed.notebook.id, 5));
    await save(
      ana,
      5,
      traceOf(other, PLAIN_WORDS).rows.map((r) => r.cells),
    );
    await ana.call(`${nbPath}/submission`, { method: 'POST' });
    expect((await grade()).traces[1]?.right).toBeLessThan(expected.length);
  });

  it('take whole points only, and staff cannot send a trace score', async () => {
    const { pedagog, ana, nbPath, open, save, grade } = await setup();
    const points = (p: unknown) =>
      pedagog.call(`${nbPath}/embeds`, {
        method: 'PUT',
        body: { embeds: [{ cell: 3, viz: 'tabela-gjurmimit', props: { preset: 'lab05-prim', points: p } }] },
      });
    for (const p of [0, 2.5, 2000, '5']) expect((await points(p)).status, String(p)).toBe(400);
    expect((await points(10)).status).toBe(200);
    await open();
    await save(ana, 3, PRIM);
    await ana.call(`${nbPath}/submission`, { method: 'POST' });
    // The run's own numbers are the code's; a table's score always comes from the server.
    const res = await pedagog.call(`${nbPath}/grades/${ana.user.id}`, {
      method: 'PUT',
      body: { ...RUN, traces: [{ cell: 3, rows: 4, right: 4, points: 10, score: 10 }] },
    });
    expect(((await res.json()) as StaffGrade).traces[0]?.score).toBe(8);
    expect((await grade()).autoScore).toBe(8);
  });
});

describe('cross-tenant isolation: trace answers', () => {
  it("cannot save into another organization's notebook", async () => {
    const a = await seedOrganization('a');
    const b = await seedOrganization('b');
    await expect(
      a.tenant.traceAnswers.save({ notebookId: b.notebook.id, userId: a.user.id, cell: 1, rows: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await a.tenant.traceAnswers.ofUser(b.notebook.id, b.user.id)).toEqual([]);
  });
});

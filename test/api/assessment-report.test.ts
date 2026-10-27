import { describe, expect, it } from 'vitest';
import type { AssessmentReport } from '../../src/shared/assessment-report';
import { PLAIN_WORDS, traceOf } from '../../src/shared/trace';
import { variantProblem, variantSeed } from '../../src/shared/trace-problem';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #170 is done when staff who review a group see, per exercise and per trace table row, how many got
// it right and the most common wrong value; counts only, from five students up, for their groups.

const VARIANT = { algorithm: 'kruskal', nodes: 5, directed: false } as const;
// Prim from A on Lab 5's graph: the edges it takes and the running total.
const PRIM = [
  { edge: 'A-C', total: '1' },
  { edge: 'C-E', total: '3' },
  { edge: 'C-D', total: '7' },
  { edge: 'B-D', total: '10' },
];

async function setup() {
  const seed = await seedOrganization('fshn');
  const { tenant, course, lab, notebook, group } = seed;
  const groupB = await tenant.groups.create({ courseId: course.id, name: 'Grupi B' });
  const pedagog = await account(seed, 'pedagog', { courseId: course.id });
  const nbPath = `/orgs/${seed.org.slug}/courses/${course.id}/labs/${lab.id}/notebooks/${notebook.id}`;
  await pedagog.call(`${nbPath}/embeds`, {
    method: 'PUT',
    body: {
      embeds: [
        { cell: 3, viz: 'tabela-gjurmimit', props: { preset: 'lab05-prim', points: 10 } },
        { cell: 5, viz: 'tabela-gjurmimit', props: { variant: VARIANT, points: 6 } },
        { cell: 7, viz: 'tabela-gjurmimit', props: { preset: 'lab05-kruskal' } },
      ],
    },
  });
  await pedagog.call(`${nbPath}/exercises`, {
    method: 'PUT',
    body: { exercises: [{ cell: 1, title: 'Shuma', test: null }] },
  });

  /** A student of the group who handed in these Prim rows (and their own variant right). */
  let n = 0;
  async function student(groupId: string, prim: Record<string, string>[] | null, exercise?: string) {
    n++;
    const user = await tenant.users.create(
      { username: `studenti.${n}`, fullName: `Studenti ${n}`, passwordHash: 'x' },
      'student',
    );
    await tenant.memberships.create({ userId: user.id, role: 'student', groupId });
    if (!prim) return user;
    const mine = variantProblem(VARIANT, variantSeed(user.id, notebook.id, 5));
    await tenant.submissions.submit({
      notebookId: notebook.id,
      userId: user.id,
      code: [],
      solved: [],
      traces: [
        { cell: 3, rows: prim },
        { cell: 5, rows: traceOf(mine, PLAIN_WORDS).rows.map((r) => r.cells) },
      ],
    });
    if (exercise) {
      await tenant.grading.record({
        notebookId: notebook.id,
        userId: user.id,
        autoScore: 0,
        maxScore: 0,
        results: [{ cell: 1, status: exercise }],
      });
    }
    return user;
  }
  const report = async (who = pedagog, query = '') => {
    const res = await who.call(`${nbPath}/report${query}`);
    return { status: res.status, body: res.ok ? ((await res.json()) as AssessmentReport) : null };
  };
  return { seed, group, groupB, pedagog, student, report };
}

describe('the assessment report', () => {
  it('stays empty below five students, but says how many handed in', async () => {
    const { group, student, report } = await setup();
    for (let i = 0; i < 4; i++) await student(group.id, PRIM, 'pass');
    await student(group.id, null);
    const { body } = await report();
    expect(body).toMatchObject({ students: 5, handedIn: 4, graded: 4, exercises: null, traces: null });
  });

  it('counts each exercise and each trace row, with the most common wrong value', async () => {
    const { group, student, report } = await setup();
    // Four put 99 as the last total, one 98, one is right, one left the table empty.
    const wrongTotal = (total: string) => PRIM.map((r, i) => (i === 3 ? { ...r, total } : r));
    for (let i = 0; i < 4; i++) await student(group.id, wrongTotal('99'), i < 3 ? 'pass' : 'fail');
    await student(group.id, wrongTotal('98'), 'error');
    await student(group.id, PRIM, 'todo');
    await student(group.id, []);
    const { body } = await report();
    expect(body).toMatchObject({ students: 7, handedIn: 7, graded: 6, group: null });
    expect(body?.exercises).toEqual([{ cell: 1, title: 'Shuma', pass: 3, fail: 1, error: 1, todo: 1 }]);

    const [prim, variant] = body?.traces ?? [];
    expect(body?.traces).toHaveLength(2);
    expect(prim).toMatchObject({ cell: 3, points: 10, variant: false, students: 7 });
    expect(prim?.rows.slice(0, 3)).toEqual(Array(3).fill({ of: 7, right: 6, empty: 1, wrong: null }));
    expect(prim?.rows[3]).toEqual({ of: 7, right: 1, empty: 1, wrong: { key: 'total', value: '99', count: 4 } });
    // Each variant was answered right from its own graph; a Kruskal table's length depends on it.
    expect(variant).toMatchObject({ cell: 5, variant: true, students: 7 });
    expect(variant?.rows[0]?.of).toBe(7);
    for (const row of variant?.rows ?? []) expect(row.right + row.empty).toBe(row.of);
  });

  it('never names a student', async () => {
    const { group, student, report } = await setup();
    const users = [];
    for (let i = 0; i < 6; i++) users.push(await student(group.id, PRIM, 'pass'));
    const text = JSON.stringify((await report()).body);
    for (const u of users) {
      expect(text).not.toContain(u.username);
      expect(text).not.toContain(u.id);
    }
  });

  it('covers one group or all those the user reviews, and no one else', async () => {
    const { seed, group, groupB, student, report } = await setup();
    for (let i = 0; i < 5; i++) await student(group.id, PRIM);
    await student(groupB.id, PRIM);
    expect((await report()).body).toMatchObject({ handedIn: 6 });
    expect((await report(undefined, `?group=${groupB.id}`)).body).toMatchObject({ handedIn: 1, traces: null });

    // An assistant of group B reviews only it; a student never sees the report.
    const assistant = await account(seed, 'assistant', { groupId: groupB.id });
    expect((await report(assistant)).body?.groups.map((g) => g.name)).toEqual(['Grupi B']);
    expect((await report(assistant)).body).toMatchObject({ handedIn: 1 });
    expect((await report(assistant, `?group=${group.id}`)).status).toBe(403);
    const ana = await account(seed, 'student', { groupId: group.id });
    expect([403, 404]).toContain((await report(ana)).status);
  });
});

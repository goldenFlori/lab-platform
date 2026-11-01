import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { codeEdits, files, grades, submissions } from '../../src/api/db/schema';
import type { CellWork, NotebookDetail } from '../../src/shared/notebooks';
import { traceProblemFor } from '../../src/shared/trace-grading';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #208: a new version in place of a notebook keeps students' work, moved with its cell; what was in a
// cell with no new place goes. Its files wait under `next.` until it is put in place.

const OLD = 'old notebook';
const NEW = 'new notebook';
const SHA = 'a'.repeat(64);

async function setup() {
  const seed = await seedOrganization('fshn');
  const { tenant, notebook, db } = seed;
  const pedagog = await account(seed, 'pedagog', { courseId: seed.course.id });
  const student = await account(seed, 'student', { groupId: seed.group.id });
  const assistant = await account(seed, 'assistant', { groupId: seed.group.id });
  const path = `/orgs/fshn/courses/${seed.course.id}/labs/${seed.lab.id}/notebooks/${notebook.id}`;
  const stage = async (name: string, body: string) =>
    pedagog.call(`${path}/files/next.${name}`, {
      method: 'PUT',
      raw: body,
      headers: { 'Content-Type': 'application/json' },
    });

  await tenant.notebooks.putFile(notebook.id, 'notebook.ipynb', {
    mime: 'application/json',
    encoding: 'identity',
    data: new TextEncoder().encode(OLD),
  });
  // The seed's embed is at cell 2; an exercise with grading at 3; the student's work at 1, 3 and 5.
  await tenant.exercises.set(notebook.id, [{ cell: 3, title: 'BFS', test: 'assert bfs() == 1' }]);
  await tenant.grading.setSetup(notebook.id, [{ cell: 3, points: 5, hiddenTest: null }]);
  const userId = student.user.id;
  for (const cell of [1, 3, 5])
    await tenant.codeEdits.save({ notebookId: notebook.id, userId, cell, code: `# ${cell}` });
  await tenant.exercises.complete({ notebookId: notebook.id, cell: 3, userId });
  await db.insert(submissions).values({
    id: crypto.randomUUID(),
    orgId: seed.org.id,
    notebookId: notebook.id,
    userId,
    code: [
      { cell: 3, code: '# 3' },
      { cell: 5, code: '# 5' },
    ],
    solved: [3],
    attempts: 1,
    submittedAt: new Date(),
  });
  await db.insert(grades).values({
    id: crypto.randomUUID(),
    orgId: seed.org.id,
    notebookId: notebook.id,
    userId,
    autoScore: 5,
    maxScore: 5,
    results: [{ cell: 3, status: 'passed' }],
    // A comment on a cell that moves, and on one that goes (#220).
    comments: [
      { cell: 3, text: 'Mirë.' },
      { cell: 5, text: 'Kjo qelizë ikën.' },
    ],
    gradedAt: new Date(),
  });
  // The new version: a cell inserted before 2, so 2 → 3 and 3 → 4; cell 5 is gone, 3 changed.
  const version = {
    map: [
      [0, 0],
      [1, 1],
      [2, 3],
      [3, 4],
      [4, 5],
    ],
    changed: [4],
    originalName: 'v2.ipynb',
    sha256: SHA,
  };
  const publish = (body: unknown = version) => pedagog.call(`${path}/version`, { method: 'POST', body });
  return { seed, pedagog, student, assistant, path, stage, publish, userId };
}

describe('a new version of a notebook', () => {
  it('moves students’ work with its cells, and drops what was in a cell that is gone', async () => {
    const { seed, pedagog, path, stage, publish, userId } = await setup();
    const { tenant, notebook, db } = seed;

    const work = (await (await pedagog.call(`${path}/cells/work`)).json()) as { cells: CellWork[] };
    expect(work.cells).toEqual([
      { cell: 1, students: 1 },
      { cell: 3, students: 1 },
      { cell: 5, students: 1 },
    ]);

    await stage('notebook.ipynb', NEW);
    await stage('rendered.json', '{}');
    const res = await publish();
    expect(res.status).toBe(200);
    const detail = (await res.json()) as NotebookDetail;
    expect(detail).toMatchObject({ originalName: 'v2.ipynb', version: SHA.slice(0, 12), changedCells: [4] });
    expect(detail.versionAt).not.toBeNull();
    expect(detail.embeds.map((e) => e.cell)).toEqual([3]);
    expect(detail.exercises.map((e) => e.cell)).toEqual([4]);
    expect((await tenant.grading.setupOf(notebook.id)).map((g) => g.cell)).toEqual([4]);

    const edits = await db.select().from(codeEdits).where(eq(codeEdits.notebookId, notebook.id));
    expect(edits.map((e) => [e.cell, e.code]).sort()).toEqual([
      [1, '# 1'],
      [4, '# 3'],
    ]);
    const [handIn] = await db.select().from(submissions).where(eq(submissions.notebookId, notebook.id));
    expect(handIn).toMatchObject({ code: [{ cell: 4, code: '# 3' }], solved: [4], traces: [] });
    const [grade] = await db.select().from(grades).where(eq(grades.userId, userId));
    expect(grade).toMatchObject({
      results: [{ cell: 4, status: 'passed' }],
      comments: [{ cell: 4, text: 'Mirë.' }],
      autoScore: 5,
    });

    // The new files are the notebook's now; nothing stays staged.
    const original = await tenant.notebooks.getFile(notebook.id, 'notebook.ipynb');
    expect(new TextDecoder().decode(original?.data)).toBe(NEW);
    const names = await db
      .select({ name: files.name })
      .from(files)
      .where(and(eq(files.orgId, seed.org.id), eq(files.notebookId, notebook.id)));
    expect(names.map((f) => f.name).sort()).toEqual(['notebook.ipynb', 'rendered.json']);
  });

  it('keeps the graph each student had in a variant trace table it moves', async () => {
    const { seed, stage, publish, userId } = await setup();
    const { tenant, notebook } = seed;
    const variant = { algorithm: 'prim', nodes: 6, directed: false };
    await tenant.notebooks.setEmbeds(notebook.id, [
      { cell: 2, viz: 'tabela-gjurmimit', title: null, props: { variant } },
    ]);
    const before = traceProblemFor({ variant }, { userId, notebookId: notebook.id, cell: 2 });

    await stage('notebook.ipynb', NEW);
    await stage('rendered.json', '{}');
    expect((await publish()).status).toBe(200);
    const [moved] = await tenant.notebooks.embedsOf(notebook.id);
    expect(moved).toMatchObject({ cell: 3, props: { variant, seedCell: 2 } });
    expect(traceProblemFor(moved?.props, { userId, notebookId: notebook.id, cell: 3 })).toEqual(before);
  });

  it('is for staff who manage the course, needs its files staged first, and keeps them hidden until then', async () => {
    const { student, assistant, pedagog, path, stage, publish } = await setup();
    // An assistant sees the lab but does not change it; to a student it is hidden until opened.
    expect((await assistant.call(`${path}/cells/work`)).status).toBe(403);
    expect((await student.call(`${path}/cells/work`)).status).toBe(404);
    expect((await publish()).status).toBe(409);

    await stage('notebook.ipynb', NEW);
    await stage('rendered.json', '{}');
    expect((await pedagog.call(`${path}/files/next.notebook.ipynb`)).status).toBe(404);
    expect((await assistant.call(`${path}/version`, { method: 'POST', body: await setupBody() })).status).toBe(403);
    // Two old cells cannot become the same new one.
    expect(
      (
        await publish({
          ...(await setupBody()),
          map: [
            [0, 1],
            [1, 1],
          ],
        })
      ).status,
    ).toBe(400);
  });
});

async function setupBody() {
  return { map: [[0, 0]], changed: [], originalName: 'v2.ipynb', sha256: SHA };
}

import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src/api/db/tenant';
import type { CourseGrades, StaffGrade } from '../../src/shared/grading';
import type { MySubmission } from '../../src/shared/submissions';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #53: grades come from the pedagog's re-run; hidden tests and unreleased grades stay with staff.

const at = (seconds: number) => new Date(Math.floor(Date.now() / 1000 + seconds) * 1000).toISOString();
const RUN = { autoScore: 2, maxScore: 3, results: [{ cell: 4, status: 'pass' }] };

async function setup() {
  const seed = await seedOrganization('fshn');
  const { course, lab, notebook, group } = seed;
  const pedagog = await account(seed, 'pedagog', { courseId: course.id });
  const assistant = await account(seed, 'assistant', { groupId: group.id });
  const ana = await account(seed, 'student', { groupId: group.id });
  const besa = await account(seed, 'student', { groupId: group.id });
  const labPath = `/orgs/${seed.org.slug}/courses/${course.id}/labs/${lab.id}`;
  const nbPath = `${labPath}/notebooks/${notebook.id}`;
  await pedagog.call(`${labPath}/access`, {
    method: 'PUT',
    body: { groupId: group.id, visibleFrom: at(-60), visibleUntil: null, solutionsFrom: null },
  });
  await pedagog.call(`${nbPath}/assignments/${group.id}`, { method: 'PUT', body: { dueAt: at(3600) } });
  await ana.call(`${nbPath}/submission`, { method: 'POST' });
  const grade = async (who: typeof ana) =>
    ((await (await who.call(`${nbPath}/submission`)).json()) as MySubmission).grade;
  return { seed, pedagog, assistant, ana, besa, nbPath, grade };
}

describe('hidden tests and points', () => {
  it('are for staff who grade, never students or assistants', async () => {
    const { pedagog, assistant, ana, nbPath } = await setup();
    const setup_ = { exercises: [{ cell: 4, points: 3, hiddenTest: 'assert shuma(2, 2) == 4' }] };
    expect((await ana.call(`${nbPath}/grading`, { method: 'PUT', body: setup_ })).status).toBe(403);
    expect((await pedagog.call(`${nbPath}/grading`, { method: 'PUT', body: setup_ })).status).toBe(200);
    expect(await (await pedagog.call(`${nbPath}/grading`)).json()).toEqual(setup_);
    expect((await ana.call(`${nbPath}/grading`)).status).toBe(403);
    expect((await assistant.call(`${nbPath}/grading`)).status).toBe(403);
    expect(JSON.stringify(await (await ana.call(nbPath)).json())).not.toContain('shuma(2, 2)');
  });
});

describe('grades', () => {
  it('are written by staff who grade, and the batch reads the code only for them', async () => {
    const { seed, pedagog, assistant, ana, besa, nbPath } = await setup();
    const g = `?group=${seed.group.id}`;
    expect((await besa.call(`${nbPath}/grades/${ana.user.id}`, { method: 'PUT', body: RUN })).status).toBe(403);
    expect((await ana.call(`${nbPath}/grades/${ana.user.id}`, { method: 'PUT', body: RUN })).status).toBe(403);
    expect((await assistant.call(`${nbPath}/grades/${ana.user.id}`, { method: 'PUT', body: RUN })).status).toBe(403);
    expect((await ana.call(`${nbPath}/grading/submissions${g}`)).status).toBe(403);
    const batch = await pedagog.call(`${nbPath}/grading/submissions${g}`);
    expect(((await batch.json()) as { submissions: { userId: string }[] }).submissions.map((s) => s.userId)).toEqual([
      ana.user.id,
    ]);
    expect((await pedagog.call(`${nbPath}/grades/${ana.user.id}`, { method: 'PUT', body: RUN })).status).toBe(200);
    // Only students of a group they grade.
    expect((await pedagog.call(`${nbPath}/grades/${crypto.randomUUID()}`, { method: 'PUT', body: RUN })).status).toBe(
      404,
    );
  });

  it('reach the student only once released, with the adjustment, which a new run keeps', async () => {
    const { seed, pedagog, ana, besa, nbPath, grade } = await setup();
    await pedagog.call(`${nbPath}/grades/${ana.user.id}`, { method: 'PUT', body: RUN });
    expect(await grade(ana)).toBeNull();
    const review = await pedagog.call(`${nbPath}/grades/${ana.user.id}`, {
      method: 'PATCH',
      body: { score: 3, feedback: 'Shumë mirë.' },
    });
    expect(((await review.json()) as StaffGrade).score).toBe(3);
    // A comment beside a cell (#220), sent alone: the score and feedback stay.
    const commented = await pedagog.call(`${nbPath}/grades/${ana.user.id}`, {
      method: 'PATCH',
      body: { comments: [{ cell: 3, text: 'Kujdes me rastin bosh.' }] },
    });
    expect(await commented.json()).toMatchObject({ score: 3, feedback: 'Shumë mirë.' });
    const twice = await pedagog.call(`${nbPath}/grades/${ana.user.id}`, {
      method: 'PATCH',
      body: {
        comments: [
          { cell: 3, text: 'a' },
          { cell: 3, text: 'b' },
        ],
      },
    });
    expect(twice.status).toBe(400);
    await pedagog.call(`${nbPath}/grades/${ana.user.id}`, { method: 'PUT', body: { ...RUN, autoScore: 1 } });
    expect((await pedagog.call(`${nbPath}/grades/release?group=${seed.group.id}`, { method: 'POST' })).status).toBe(
      204,
    );
    expect(await grade(ana)).toEqual({
      score: 3,
      maxScore: 3,
      feedback: 'Shumë mirë.',
      comments: [{ cell: 3, text: 'Kujdes me rastin bosh.' }],
    });
    expect(await grade(besa)).toBeNull();
    const list = (await (await pedagog.call(`${nbPath}/grades?group=${seed.group.id}`)).json()) as {
      grades: StaffGrade[];
    };
    expect(list.grades).toMatchObject([{ userId: ana.user.id, autoScore: 1, score: 3 }]);
    expect((await besa.call(`${nbPath}/grades?group=${seed.group.id}`)).status).toBe(403);
  });
});

describe("a course's released grades (#114)", () => {
  it('go to staff who grade, for their groups, and only once released', async () => {
    const { seed, pedagog, assistant, ana, besa, nbPath } = await setup();
    const coursePath = `/orgs/${seed.org.slug}/courses/${seed.course.id}/grades`;
    await pedagog.call(`${nbPath}/grades/${ana.user.id}`, { method: 'PUT', body: RUN });
    await pedagog.call(`${nbPath}/grades/release?group=${seed.group.id}`, { method: 'POST' });
    // Graded after the release: not released yet.
    await besa.call(`${nbPath}/submission`, { method: 'POST' });
    await pedagog.call(`${nbPath}/grades/${besa.user.id}`, { method: 'PUT', body: RUN });

    const data = (await (await pedagog.call(coursePath)).json()) as CourseGrades;
    expect(data.notebooks).toEqual([{ id: seed.notebook.id, lab: seed.lab.n, title: seed.notebook.title }]);
    expect(data.students.map((s) => s.id).sort()).toEqual([ana.user.id, besa.user.id].sort());
    expect(data.grades).toEqual([{ userId: ana.user.id, notebookId: seed.notebook.id, score: 2, maxScore: 3 }]);

    expect((await assistant.call(coursePath)).status).toBe(403);
    expect((await ana.call(coursePath)).status).toBe(403);

    // A pedagog of another group gets that group's students only.
    const groupB = await seed.tenant.groups.create({ courseId: seed.course.id, name: 'Grupi B' });
    const other = await account(seed, 'pedagog', { groupId: groupB.id });
    const theirs = (await (await other.call(coursePath)).json()) as CourseGrades;
    expect(theirs).toEqual({ notebooks: [], students: [], grades: [] });
  });
});

describe('cross-tenant isolation: grading', () => {
  it("cannot set or read another organization's", async () => {
    const a = await seedOrganization('a');
    const b = await seedOrganization('b');
    await b.tenant.grading.setSetup(b.notebook.id, [{ cell: 1, points: 1, hiddenTest: 'assert True' }]);
    await b.tenant.grading.record({
      notebookId: b.notebook.id,
      userId: b.user.id,
      autoScore: 1,
      maxScore: 1,
      results: [],
    });
    expect(await a.tenant.grading.setupOf(b.notebook.id)).toEqual([]);
    expect(await a.tenant.grading.of(b.notebook.id, b.user.id)).toBeUndefined();
    await expect(
      a.tenant.grading.setSetup(b.notebook.id, [{ cell: 1, points: 1, hiddenTest: null }]),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      a.tenant.grading.record({ notebookId: b.notebook.id, userId: a.user.id, autoScore: 1, maxScore: 1, results: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await a.tenant.grading.review(b.notebook.id, b.user.id, { score: 0, feedback: null })).toBe(false);
    await b.tenant.grading.release(b.notebook.id, [b.user.id]);
    expect(await a.tenant.grading.releasedInCourse(b.course.id, [b.group.id])).toEqual({ students: [], released: [] });
  });
});

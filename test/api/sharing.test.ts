import { describe, expect, it } from 'vitest';
import type { CourseSummary } from '../../src/shared/courses';
import type { CourseShareView, SharePreview } from '../../src/shared/sharing';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #203: a course's author shares it with a link; staff who may create courses in another institution
// copy its content into a new course of their own. Never its people or their work, and its solutions
// only when the author includes them. Both sides see where the copy came from.

/** More than one 512 KB chunk, so the copy has to keep the chunks' order. */
const BIG = Uint8Array.from({ length: 700_000 }, (_, i) => i % 251);

async function setup() {
  const fshn = await seedOrganization('fshn');
  const upt = await seedOrganization('upt');
  const { tenant, notebook, lab, group } = fshn;
  // The shared course's content, beside a solution notebook, one not ready yet, and a student's work.
  await tenant.notebooks.putFile(notebook.id, 'notebook.ipynb', {
    mime: 'application/json',
    encoding: 'identity',
    data: BIG,
  });
  await tenant.exercises.set(notebook.id, [{ cell: 3, title: 'BFS', test: 'assert bfs(g) == [1]' }]);
  await tenant.grading.setSetup(notebook.id, [{ cell: 3, points: 5, hiddenTest: 'assert bfs(h) == [2]' }]);
  await tenant.notebooks.setSearchSections(notebook.id, [
    { anchor: 'bfs', title: 'BFS', text: 'Kërkimi', keywords: 'bfs' },
  ]);
  const solution = await tenant.notebooks.create({
    labId: lab.id,
    kind: 'solution',
    title: 'Zgjidhjet',
    position: 2,
    originalName: 'zgjidhjet.ipynb',
    sha256: '1'.repeat(64),
    readyAt: new Date(),
  });
  await tenant.notebooks.create({
    labId: lab.id,
    kind: 'extra',
    title: 'Pa përfunduar',
    position: 3,
    originalName: 'draft.ipynb',
    sha256: '2'.repeat(64),
  });
  const student = await account(fshn, 'student', { groupId: group.id });
  await tenant.codeEdits.save({ notebookId: notebook.id, userId: student.user.id, cell: 3, code: 'print(1)' });

  const author = await account(fshn, 'pedagog', { courseId: fshn.course.id });
  const assistant = await account(fshn, 'assistant', { courseId: fshn.course.id });
  const copier = await account(upt, 'pedagog');
  const uptStudent = await account(upt, 'student', { groupId: upt.group.id });
  const share = async (solutions: boolean) =>
    (await (
      await author.call(`/orgs/fshn/courses/${fshn.course.id}/share`, { method: 'PUT', body: { solutions } })
    ).json()) as CourseShareView;
  const copy = (who: typeof copier, token: string, org = 'upt') =>
    who.call(`/orgs/${org}/courses/from-share`, {
      method: 'POST',
      body: { token, title: 'Struktura Diskrete', academicYear: '2027/28' },
    });
  return { fshn, upt, solution, author, assistant, copier, uptStudent, share, copy };
}

/** Everything under the copied course, read as its institution sees it. */
async function contentOf(seed: Awaited<ReturnType<typeof seedOrganization>>, courseId: string) {
  const { tenant } = seed;
  const labs = await tenant.labs.ofCourse(courseId);
  const notebooks = (await Promise.all(labs.map((l) => tenant.notebooks.ofLab(l.id)))).flat();
  return { labs, notebooks };
}

describe('sharing a course with another institution', () => {
  it('copies its content into a new course, without solutions, people or work', async () => {
    const { fshn, upt, share, copier, copy } = await setup();
    const { share: link } = await share(false);
    const token = link?.token as string;

    const preview = (await (await copier.call(`/shares/${token}`)).json()) as SharePreview;
    expect(preview).toEqual({
      title: 'SDA 2026/27',
      academicYear: '2026/27',
      institution: 'Org fshn',
      solutions: false,
      labs: [{ title: 'Grafet', notebooks: 1 }],
      destinations: [{ slug: 'upt', name: 'Org upt' }],
    });

    const res = await copy(copier, token);
    expect(res.status).toBe(201);
    const course = (await res.json()) as CourseSummary;
    expect(course).toMatchObject({
      title: 'Struktura Diskrete',
      academicYear: '2027/28',
      ai: false,
      copiedFrom: { title: 'SDA 2026/27', institution: 'Org fshn' },
    });

    const { labs, notebooks } = await contentOf(upt, course.id);
    expect(labs.map((l) => [l.n, l.title])).toEqual([[1, 'Grafet']]);
    expect(notebooks.map((n) => n.kind)).toEqual(['main']);
    const copied = notebooks[0]?.id as string;
    expect(copied).not.toBe(fshn.notebook.id);
    const file = await upt.tenant.notebooks.getFile(copied, 'notebook.ipynb');
    expect(file?.data).toEqual(BIG);
    expect(await upt.tenant.notebooks.embedsOf(copied)).toMatchObject([{ cell: 2, viz: 'grafet' }]);
    expect(await upt.tenant.exercises.of(copied)).toMatchObject([{ cell: 3, test: 'assert bfs(g) == [1]' }]);
    expect(await upt.tenant.grading.setupOf(copied)).toEqual([]);
    // No groups, visibility or people came along: only its creator, as its pedagog.
    expect(await upt.tenant.groups.ofCourse(course.id)).toEqual([]);
    expect((await upt.tenant.labAccess.ofCourse(course.id)).length).toBe(0);
    const members = (await upt.tenant.memberships.list()).filter((m) => m.courseId === course.id);
    expect(members.map((m) => [m.userId, m.role])).toEqual([[copier.user.id, 'pedagog']]);
    expect(await upt.tenant.codeEdits.ofUser(copied, copier.user.id)).toEqual([]);

    // The original is untouched, and its author sees who copied it.
    expect((await contentOf(fshn, fshn.course.id)).notebooks).toHaveLength(3);
    const view = (await share(false)).copies;
    expect(view).toMatchObject([{ institution: 'Org upt', academicYear: '2027/28' }]);
  });

  it('includes the solutions and the grading only when the author says so', async () => {
    const { upt, share, copier, copy } = await setup();
    const token = (await share(true)).share?.token as string;
    expect((await share(true)).share?.token).toBe(token);
    const course = (await (await copy(copier, token)).json()) as CourseSummary;
    const { notebooks } = await contentOf(upt, course.id);
    expect(notebooks.map((n) => n.kind)).toEqual(['main', 'solution']);
    expect(await upt.tenant.grading.setupOf(notebooks[0]?.id as string)).toMatchObject([
      { cell: 3, points: 5, hiddenTest: 'assert bfs(h) == [2]' },
    ]);
  });

  it('is for its managers to share, and for those who may create courses to open and copy', async () => {
    const { fshn, share, assistant, uptStudent, copy } = await setup();
    const token = (await share(false)).share?.token as string;
    const path = `/orgs/fshn/courses/${fshn.course.id}/share`;
    expect((await assistant.call(path)).status).toBe(403);
    expect((await assistant.call(path, { method: 'PUT', body: { solutions: false } })).status).toBe(403);
    expect((await assistant.call(path, { method: 'DELETE' })).status).toBe(403);
    // A student with the link sees nothing, as with a wrong token, and cannot copy.
    expect((await uptStudent.call(`/shares/${token}`)).status).toBe(404);
    expect((await uptStudent.call(`/shares/${'0'.repeat(32)}`)).status).toBe(404);
    expect((await copy(uptStudent, token)).status).toBe(403);
    expect((await copy(uptStudent, token, 'fshn')).status).toBe(404);
  });

  it('stops working when sharing stops; copies made stay, also once the original is gone', async () => {
    const { fshn, upt, author, share, copier, copy } = await setup();
    const token = (await share(false)).share?.token as string;
    const course = (await (await copy(copier, token)).json()) as CourseSummary;
    expect((await author.call(`/orgs/fshn/courses/${fshn.course.id}/share`, { method: 'DELETE' })).status).toBe(204);
    expect((await copier.call(`/shares/${token}`)).status).toBe(404);
    expect((await copy(copier, token)).status).toBe(404);
    await fshn.tenant.courses.remove(fshn.course.id);
    expect(await upt.tenant.courses.get(course.id)).toMatchObject({
      copiedFromTitle: 'SDA 2026/27',
      copiedFromInstitution: 'Org fshn',
    });
    expect((await contentOf(upt, course.id)).notebooks).toHaveLength(1);
  });
});

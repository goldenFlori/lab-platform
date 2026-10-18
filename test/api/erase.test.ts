import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { generateJoinCode } from '../../src/shared/join-code';
import type { DeletionRequestView, ErasureView, PersonGrade } from '../../src/shared/my-data';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #115 is done when, after erasing, nothing of the person is left in the institution (proven table
// by table), their data elsewhere is untouched, and a pedagog or student cannot erase anyone.

const at = (seconds: number) => new Date(Math.floor(Date.now() / 1000 + seconds) * 1000).toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const USER_COLUMNS = ['user_id', 'host_id', 'handled_by', 'owner_user_id', 'erased_by'];

/**
 * Every row in the database that points at the user, by table and column: in one organization, or
 * anywhere (then the account itself too). Read from the live schema, so a new table is checked too.
 */
async function rowsOf(userId: string, orgId?: string) {
  const { results: tables } = await env.DB.prepare(
    "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '\\_%' escape '\\'",
  ).all<{ name: string }>();
  const found: Record<string, number> = {};
  for (const { name } of tables) {
    const { results } = await env.DB.prepare(`select name from pragma_table_info('${name}')`).all<{ name: string }>();
    const columns = results.map((c) => c.name);
    const inOrg = columns.includes('org_id');
    if (orgId && !inOrg) continue;
    const pointing = columns.filter((c) => USER_COLUMNS.includes(c) || (name === 'users' && c === 'id'));
    for (const column of pointing) {
      const row = await env.DB.prepare(
        `select count(*) as n from "${name}" where "${column}" = ?${orgId ? ' and org_id = ?' : ''}`,
      )
        .bind(...(orgId ? [userId, orgId] : [userId]))
        .first<{ n: number }>();
      if (row?.n) found[`${name}.${column}`] = row.n;
    }
  }
  return found;
}

async function setup() {
  const seed = await seedOrganization('fshn');
  const { course, lab, notebook, group, tenant } = seed;
  const admin = await account(seed, 'admin');
  const pedagog = await account(seed, 'pedagog', { courseId: course.id });
  const ana = await account(seed, 'student', { groupId: group.id });
  const labPath = `/orgs/${seed.org.slug}/courses/${course.id}/labs/${lab.id}`;
  const nbPath = `${labPath}/notebooks/${notebook.id}`;
  const requests = `/orgs/${seed.org.slug}/deletion-requests`;
  await pedagog.call(`${labPath}/access`, {
    method: 'PUT',
    body: { groupId: group.id, visibleFrom: at(-60), visibleUntil: null, solutionsFrom: null },
  });
  await pedagog.call(`${nbPath}/exercises`, {
    method: 'PUT',
    body: { exercises: [{ cell: 4, title: 'Ushtrimi 1', test: null }] },
  });
  await pedagog.call(`${nbPath}/assignments/${group.id}`, { method: 'PUT', body: { dueAt: at(3600) } });

  /** Everything a student leaves behind, through the API where it is quick, else the data layer. */
  async function work(student: typeof ana) {
    const userId = student.user.id;
    await student.call(nbPath);
    await student.call(`${labPath}/activity`, { method: 'POST', body: { kind: 'run' } });
    await student.call(`${nbPath}/edits/4`, { method: 'PUT', body: { code: 'def shuma(a, b):\n    return a + b' } });
    await student.call(`${nbPath}/exercises/4/done`, { method: 'POST' });
    await student.call(`${nbPath}/submission`, { method: 'POST' });
    await pedagog.call(`${nbPath}/grades/${userId}`, {
      method: 'PUT',
      body: { autoScore: 3, maxScore: 4, results: [{ cell: 4, status: 'pass' }] },
    });
    await pedagog.call(`${nbPath}/grades/release?group=${group.id}`, { method: 'POST' });
    const question = { courseId: course.id, notebookId: notebook.id, userId, cell: 4 };
    await tenant.ai.ask({ ...question, code: 'x', error: 'NameError', answer: 'Shiko rreshtin 1.' });
    await tenant.ai.record({ courseId: course.id, userId, day: today(), requests: 1, neurons: 10 });
    await tenant.surveys.open(course.id, new Date(Date.now() + 3600_000));
    const survey = await tenant.surveys.ofCourse(course.id);
    await tenant.surveys.answer(survey?.id ?? '', userId, [['code', 5]], null);
    await student.call('/me/deletion-request', { method: 'POST', body: { note: 'Mbarova.' } });
    const list = (await (await admin.call(requests)).json()) as (DeletionRequestView & { id: string })[];
    return list.find((r) => r.username === student.user.username && !r.handledAt)?.id ?? '';
  }

  return { seed, admin, pedagog, ana, nbPath, requests, work };
}

describe('erasing a person (#115)', () => {
  it("leaves nothing of them in the institution, keeps their data elsewhere and the institution's content", async () => {
    const { seed, admin, pedagog, ana, nbPath, requests, work } = await setup();
    // Ana studies at another institution too, where she has saved code.
    const other = await seedOrganization('tjeter');
    const code = generateJoinCode();
    await other.tenant.groups.update(other.group.id, { joinCode: code });
    expect((await ana.call('/join', { method: 'POST', body: { code } })).status).toBe(200);
    await other.tenant.codeEdits.save({ notebookId: other.notebook.id, userId: ana.user.id, cell: 1, code: 'x = 1' });
    // She also once hosted a Live Lab here, and handled nothing.
    await seed.tenant.live.start(seed.lab.id, ana.user.id);
    const request = await work(ana);
    expect(Object.keys(await rowsOf(ana.user.id, seed.org.id)).length).toBeGreaterThan(8);

    const grades = (await (await admin.call(`${requests}/${request}/grades`)).json()) as { grades: PersonGrade[] };
    expect(grades.grades).toMatchObject([
      { course: seed.course.title, lab: seed.lab.n, notebook: seed.notebook.title, score: 3, maxScore: 4 },
    ]);
    const erased = await admin.call(`${requests}/${request}/erase`, { method: 'POST' });
    expect(await erased.json()).toEqual({ accountDeleted: false });

    expect(await rowsOf(ana.user.id, seed.org.id)).toEqual({});
    // Her request went to both institutions; the other one still has it to handle.
    expect(await rowsOf(ana.user.id, other.org.id)).toEqual({
      'memberships.user_id': 1,
      'code_edits.user_id': 1,
      'deletion_requests.user_id': 1,
    });
    expect((await ana.call('/me')).status).toBe(200);
    expect((await pedagog.call(nbPath)).status).toBe(200);

    // The institution keeps a record that it acted, with nothing about the person.
    const log = await (await admin.call(`/orgs/${seed.org.slug}/erasures`)).text();
    expect(JSON.parse(log)).toMatchObject([{ by: admin.user.fullName, accountDeleted: false }] as ErasureView[]);
    expect(log).not.toContain(ana.user.username);
    expect(await (await admin.call(requests)).text()).not.toContain(ana.user.username);
  });

  it('deletes the account when nothing ties it to another institution, and its sessions end', async () => {
    const { seed, admin, ana, requests, work } = await setup();
    const request = await work(ana);
    const erased = await admin.call(`${requests}/${request}/erase`, { method: 'POST' });
    expect(await erased.json()).toEqual({ accountDeleted: true });
    expect(await rowsOf(ana.user.id)).toEqual({});
    expect((await ana.call('/me')).status).toBe(401);
    expect(await (await admin.call(`/orgs/${seed.org.slug}/erasures`)).json()).toMatchObject([
      { accountDeleted: true },
    ]);
  });

  it('is only for the institution’s admins, never for their own account or another institution', async () => {
    const { seed, admin, pedagog, ana, requests } = await setup();
    await ana.call('/me/deletion-request', { method: 'POST', body: {} });
    await admin.call('/me/deletion-request', { method: 'POST', body: {} });
    const list = (await (await admin.call(requests)).json()) as DeletionRequestView[];
    const of = (username: string) => list.find((r) => r.username === username)?.id ?? '';
    const anas = of(ana.user.username);

    for (const who of [pedagog, ana]) {
      expect((await who.call(`${requests}/${anas}/grades`)).status).toBe(403);
      expect((await who.call(`${requests}/${anas}/erase`, { method: 'POST' })).status).toBe(403);
      expect((await who.call(`/orgs/${seed.org.slug}/erasures`)).status).toBe(403);
    }
    expect((await admin.call(`${requests}/${of(admin.user.username)}/erase`, { method: 'POST' })).status).toBe(409);

    const other = await seedOrganization('tjeter');
    const otherAdmin = await account(other, 'admin');
    const theirs = `/orgs/${other.org.slug}/deletion-requests/${anas}`;
    expect((await otherAdmin.call(`${theirs}/grades`)).status).toBe(404);
    expect((await otherAdmin.call(`${theirs}/erase`, { method: 'POST' })).status).toBe(404);

    // A handled request erases nothing.
    await admin.call(`${requests}/${anas}/handled`, { method: 'POST' });
    expect((await admin.call(`${requests}/${anas}/erase`, { method: 'POST' })).status).toBe(404);
    expect((await ana.call('/me')).status).toBe(200);
  });
});

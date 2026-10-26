import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { NotFoundError, type TenantDb } from '../../src/api/db/tenant';
import { handleError, notFound } from '../../src/api/errors';
import { EXPORT_PARTS } from '../../src/shared/org-export';
import { type Seeded, seedOrganization } from './fixtures';

// Every tenant-owned resource, as seen from another organization: it must look like it does not exist.

/** What every tenant table offers, whatever its columns. */
type AnyRepo = {
  list(): Promise<{ id: string }[]>;
  get(id: string): Promise<{ id: string } | undefined>;
  update(id: string, changes: never): Promise<unknown>;
  remove(id: string): Promise<boolean>;
};

type Resource = {
  name: string;
  repo: (tenant: TenantDb) => AnyRepo;
  row: (seed: Seeded) => { id: string };
  changes: Record<string, unknown>;
};

const resources: Resource[] = [
  { name: 'course templates', repo: (t) => t.courseTemplates, row: (s) => s.template, changes: { title: 'X' } },
  { name: 'courses', repo: (t) => t.courses, row: (s) => s.course, changes: { title: 'X' } },
  { name: 'groups', repo: (t) => t.groups, row: (s) => s.group, changes: { name: 'X' } },
  { name: 'labs', repo: (t) => t.labs, row: (s) => s.lab, changes: { title: 'X' } },
  { name: 'lab access', repo: (t) => t.labAccess, row: (s) => s.labAccess, changes: { visibleFrom: new Date() } },
  { name: 'memberships', repo: (t) => t.memberships, row: (s) => s.membership, changes: { role: 'student' } },
  { name: 'notebooks', repo: (t) => t.notebooks, row: (s) => s.notebook, changes: { title: 'X' } },
];

async function seedTwo() {
  return { a: await seedOrganization('a'), b: await seedOrganization('b') };
}

describe.each(resources)('cross-tenant isolation: $name', ({ repo, row, changes }) => {
  it("does not find another organization's row", async () => {
    const { a, b } = await seedTwo();
    expect(await repo(a.tenant).get(row(b).id)).toBeUndefined();
    expect(await repo(a.tenant).get(row(a).id)).toBeDefined();
  });

  it("lists only the organization's own rows", async () => {
    const { a, b } = await seedTwo();
    const ids = (await repo(a.tenant).list()).map((r) => r.id);
    expect(ids).toContain(row(a).id);
    expect(ids).not.toContain(row(b).id);
  });

  it("cannot change another organization's row", async () => {
    const { a, b } = await seedTwo();
    expect(await repo(a.tenant).update(row(b).id, changes as never)).toBeUndefined();
    expect(await repo(b.tenant).get(row(b).id)).toMatchObject(
      Object.fromEntries(Object.keys(changes).map((k) => [k, (row(b) as Record<string, unknown>)[k]])),
    );
  });

  it("cannot delete another organization's row", async () => {
    const { a, b } = await seedTwo();
    expect(await repo(a.tenant).remove(row(b).id)).toBe(false);
    expect(await repo(b.tenant).get(row(b).id)).toBeDefined();
  });
});

describe('cross-tenant isolation: users', () => {
  it("does not find or list another organization's users", async () => {
    const { a, b } = await seedTwo();
    expect(await a.tenant.users.get(b.user.id)).toBeUndefined();
    expect((await a.tenant.users.list()).map((u) => u.id)).toEqual([a.user.id]);
  });

  it('never exposes password hashes', async () => {
    const { a } = await seedTwo();
    const user = await a.tenant.users.create(
      { username: 'hashed', fullName: 'Hashed User', passwordHash: 'pbkdf2$secret' },
      'student',
    );
    expect(user).not.toHaveProperty('passwordHash');
    expect(await a.tenant.users.list()).not.toContainEqual(
      expect.objectContaining({ passwordHash: expect.anything() }),
    );
  });
});

describe('cross-tenant isolation: links to another organization', () => {
  it('rejects a child row whose parent belongs to another organization', async () => {
    const { a, b } = await seedTwo();
    const attempts = [
      a.tenant.courses.create({ title: 'X', academicYear: '2026/27', templateId: b.template.id }),
      a.tenant.groups.create({ courseId: b.course.id, name: 'X' }),
      a.tenant.labs.create({ courseId: b.course.id, n: 2, title: 'X', position: 2 }),
      a.tenant.labAccess.create({ labId: b.lab.id }),
      a.tenant.labAccess.create({ labId: a.lab.id, groupId: b.group.id }),
      a.tenant.labAccess.create({ labId: b.lab.id, groupId: b.group.id }),
      a.tenant.memberships.create({ userId: a.user.id, courseId: b.course.id, role: 'pedagog' }),
      a.tenant.memberships.create({ userId: a.user.id, groupId: b.group.id, role: 'student' }),
    ];
    for (const attempt of attempts) await expect(attempt).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      a.tenant.notebooks.setSearchSections(b.notebook.id, [{ anchor: null, title: 'X', text: 'X', keywords: '' }]),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      a.tenant.activity.record({ labId: b.lab.id, userId: a.user.id, kind: 'view', day: '2026-10-10' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      a.tenant.codeEdits.save({ notebookId: b.notebook.id, userId: a.user.id, cell: 1, code: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(a.tenant.exercises.set(b.notebook.id, [{ cell: 1, title: 'X', test: null }])).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      a.tenant.exercises.complete({ notebookId: b.notebook.id, cell: 1, userId: a.user.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      a.tenant.traceAnswers.save({ notebookId: b.notebook.id, userId: a.user.id, cell: 1, rows: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      a.tenant.predictions.record({
        notebookId: b.notebook.id,
        cell: 1,
        userId: a.user.id,
        day: '2026-10-25',
        topic: 'prim',
        decision: '1:x',
        right: true,
        pick: 'A',
        answer: 'A',
        prompt: 'P',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(a.tenant.submissions.open(a.notebook.id, b.group.id, new Date())).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      a.tenant.submissions.submit({ notebookId: b.notebook.id, userId: a.user.id, code: [], solved: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      a.tenant.grading.setSetup(b.notebook.id, [{ cell: 1, points: 1, hiddenTest: null }]),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(a.tenant.surveys.open(b.course.id, new Date())).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      a.tenant.ai.ask({
        courseId: a.course.id,
        notebookId: b.notebook.id,
        userId: a.user.id,
        cell: 1,
        code: 'x',
        error: 'E',
        answer: 'A',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      a.tenant.ai.record({ courseId: b.course.id, userId: a.user.id, day: '2026-10-12', requests: 1, neurons: 1 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("neither lists nor handles another organization's deletion requests", async () => {
    const { a, b } = await seedTwo();
    await b.tenant.personal.requestDeletion(b.user.id, null);
    const [request] = await b.tenant.personal.deletionRequests();
    expect(await a.tenant.personal.deletionRequests()).toEqual([]);
    expect(await a.tenant.personal.handleDeletion(request?.id as string, a.user.id)).toBe(false);
    expect((await b.tenant.personal.deletionRequests())[0]?.handledAt).toBeNull();
    // Nor erases from them (#115): not their request, grades or rows, nor sees their erasures.
    expect(await a.tenant.personal.openRequest(request?.id as string)).toBeUndefined();
    await b.tenant.grading.record({
      notebookId: b.notebook.id,
      userId: b.user.id,
      autoScore: 1,
      maxScore: 1,
      results: [],
    });
    await b.tenant.grading.release(b.notebook.id, [b.user.id]);
    expect(await a.tenant.personal.releasedGrades(b.user.id)).toEqual([]);
    await a.tenant.personal.erase(b.user.id, new Date(), a.user.id);
    expect(await b.tenant.grading.of(b.notebook.id, b.user.id)).toBeDefined();
    expect(await b.tenant.personal.deletionRequests()).toHaveLength(1);
    expect(await b.tenant.personal.erasures()).toEqual([]);
  });

  it("exports none of another organization's rows (#117)", async () => {
    const { a, b } = await seedTwo();
    const ids = [b.org.id, b.user.id, b.course.id, b.group.id, b.lab.id, b.notebook.id, b.membership.id];
    for (const part of EXPORT_PARTS) {
      const text = JSON.stringify(await a.tenant.export.page(part, null));
      for (const id of ids) expect(text, part).not.toContain(id);
    }
    expect(await a.tenant.notebooks.getFile(b.notebook.id, 'notebook.ipynb')).toBeUndefined();
  });

  it("does not give memberships to another organization's users", async () => {
    const { a, b } = await seedTwo();
    await expect(a.tenant.memberships.create({ userId: b.user.id, role: 'pedagog' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  // Group names repeat across organizations ("Grupi A"), so this also proves that a uniqueness check
  // never compares two organizations.
  it('cannot move a row under another organization', async () => {
    const { a, b } = await seedTwo();
    await expect(a.tenant.groups.update(a.group.id, { courseId: b.course.id })).rejects.toBeInstanceOf(NotFoundError);
    await a.tenant.courses.update(a.course.id, { orgId: b.org.id, title: 'Renamed' } as never);
    expect(await a.tenant.courses.get(a.course.id)).toMatchObject({ orgId: a.org.id, title: 'Renamed' });
  });

  it('is enforced by the database too, not only by the data layer', async () => {
    const { a, b } = await seedTwo();
    const raw = env.DB.prepare('insert into groups (id, org_id, course_id, name) values (?, ?, ?, ?)').bind(
      crypto.randomUUID(),
      a.org.id,
      b.course.id,
      'Bypass',
    );
    await expect(raw.run()).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });
});

describe('API answers for missing resources', () => {
  it('gives the same 404 for a missing route and for a resource of another organization', async () => {
    const app = new Hono()
      .get('/other-org', () => {
        throw new NotFoundError();
      })
      .notFound(notFound)
      .onError(handleError);

    const fromTenant = await app.request('/other-org');
    const missingRoute = await app.request('/nothing-here');
    expect(fromTenant.status).toBe(404);
    expect(missingRoute.status).toBe(404);
    expect(await fromTenant.json()).toEqual(await missingRoute.json());
  });
});

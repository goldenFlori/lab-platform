import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createDb } from '../../src/api/db';
import { uuidv7 } from '../../src/api/db/ids';
import { memberships, users } from '../../src/api/db/schema';
import { ROWS_PER_INSERT } from '../../src/api/db/tenant';
import type { CourseSummary } from '../../src/shared/courses';
import { hashPassword } from '../../src/shared/password';
import { generateStudentPassword, IMPORT_CHUNK, usernameBase } from '../../src/shared/student-names';
import type { GroupStudent } from '../../src/shared/students';
import { seedOrganization } from './fixtures';
import { account, caller } from './http';

const json = async <T>(res: Response) => (await res.json()) as T;

/** What the browser does: a password and its hash per name. */
async function prepare(names: string[]) {
  return Promise.all(
    names.map(async (fullName) => {
      const password = generateStudentPassword();
      return { fullName, username: usernameBase(fullName), password, passwordHash: await hashPassword(password) };
    }),
  );
}

async function setup() {
  const seed = await seedOrganization('fshn');
  const pedagog = await account(seed, 'pedagog', { courseId: seed.course.id });
  const base = `/orgs/${seed.org.slug}/courses/${seed.course.id}/groups/${seed.group.id}`;
  return { seed, pedagog, base };
}

describe('importing students', () => {
  it('imports 120 students in chunks; each can sign in and sees only this course', async () => {
    const { seed, pedagog, base } = await setup();
    const names = Array.from({ length: 120 }, (_, i) => `Studenti${String.fromCharCode(97 + (i % 26))} Nr${i}`);
    const prepared = await prepare(names);

    const imported: GroupStudent[] = [];
    for (let i = 0; i < prepared.length; i += IMPORT_CHUNK) {
      const chunk = prepared.slice(i, i + IMPORT_CHUNK).map(({ password: _, ...student }) => student);
      const res = await pedagog.call(`${base}/students`, { method: 'POST', body: { students: chunk } });
      expect(res.status).toBe(201);
      imported.push(...(await json<{ students: GroupStudent[] }>(res)).students);
    }
    expect(imported).toHaveLength(120);
    expect(imported.map((s) => s.fullName)).toEqual(names);

    const listed = await json<GroupStudent[]>(await pedagog.call(`${base}/students`));
    expect(listed).toHaveLength(120);

    // The slip's username and password work, and the student sees this course and no other.
    const other = await seed.tenant.courses.create({ title: 'Matematikë', academicYear: '2026/27' });
    const first = imported[0] as GroupStudent;
    const login = await caller()('/auth/login', {
      method: 'POST',
      body: { username: first.username, password: prepared[0]?.password },
    });
    expect(login.status).toBe(200);
    const student = caller(`__Host-session=${login.headers.get('Set-Cookie')?.match(/__Host-session=([^;]*)/)?.[1]}`);
    const courses = await json<CourseSummary[]>(await student(`/orgs/${seed.org.slug}/courses`));
    expect(courses.map((c) => c.id)).toEqual([seed.course.id]);
    expect((await student(`/orgs/${seed.org.slug}/courses/${other.id}`)).status).toBe(404);
  });

  it('numbers usernames that are taken, also by other schools and within the same list', async () => {
    const { pedagog, base } = await setup();
    const elsewhere = await seedOrganization('other');
    await elsewhere.tenant.users.create({ username: 'arben.hoxha', fullName: 'Arben Hoxha' }, 'student');

    const prepared = await prepare(['Arben Hoxha', 'Arben Hoxha', 'Mira Kola']);
    const res = await pedagog.call(`${base}/students`, {
      method: 'POST',
      body: { students: prepared.map(({ password: _, ...s }) => s) },
    });
    const { students } = await json<{ students: GroupStudent[] }>(res);
    expect(students.map((s) => s.username)).toEqual(['arben.hoxha2', 'arben.hoxha3', 'mira.kola']);
  });

  it(`refuses more than ${IMPORT_CHUNK} students at once, weak hashes and bad usernames`, async () => {
    const { pedagog, base } = await setup();
    const many = await prepare(Array.from({ length: IMPORT_CHUNK + 1 }, (_, i) => `Emri Nr${i}`));
    const tooMany = await pedagog.call(`${base}/students`, {
      method: 'POST',
      body: { students: many.map(({ password: _, ...s }) => s) },
    });
    expect(tooMany.status).toBe(400);

    const weak = { fullName: 'A B', username: 'a.b', passwordHash: await hashPassword('x', 1000) };
    expect((await pedagog.call(`${base}/students`, { method: 'POST', body: { students: [weak] } })).status).toBe(400);
    const plain = { fullName: 'A B', username: 'a.b', passwordHash: 'sekret' };
    expect((await pedagog.call(`${base}/students`, { method: 'POST', body: { students: [plain] } })).status).toBe(400);
    const [ok] = await prepare(['A B']);
    const badName = { ...ok, username: 'Robert"); drop' };
    expect((await pedagog.call(`${base}/students`, { method: 'POST', body: { students: [badName] } })).status).toBe(
      400,
    );
  });

  it('lets an assistant of the group import, but not a student or the staff of another group', async () => {
    const { seed, base } = await setup();
    const sibling = await seed.tenant.groups.create({ courseId: seed.course.id, name: 'Grupi B' });
    const [student] = await prepare(['Besa Duka']);
    const body = { students: [{ fullName: 'Besa Duka', username: 'besa.duka', passwordHash: student?.passwordHash }] };

    const assistant = await account(seed, 'assistant', { groupId: seed.group.id });
    expect((await assistant.call(`${base}/students`, { method: 'POST', body })).status).toBe(201);
    const classmate = await account(seed, 'student', { groupId: seed.group.id });
    expect((await classmate.call(`${base}/students`, { method: 'POST', body })).status).toBe(403);
    const otherAssistant = await account(seed, 'assistant', { groupId: sibling.id });
    // They see the course through their own group, so this is 403, not 404.
    expect((await otherAssistant.call(`${base}/students`, { method: 'POST', body })).status).toBe(403);
  });
});

describe('resetting a password', () => {
  it('gives a student a new password that works, ends their sessions, and retires the old one', async () => {
    const { pedagog, base } = await setup();
    const [prepared] = await prepare(['Mira Kola']);
    const { students } = await json<{ students: GroupStudent[] }>(
      await pedagog.call(`${base}/students`, {
        method: 'POST',
        body: { students: [{ fullName: 'Mira Kola', username: 'mira.kola', passwordHash: prepared?.passwordHash }] },
      }),
    );
    const mira = students[0] as GroupStudent;
    const signIn = (password: string) =>
      caller()('/auth/login', { method: 'POST', body: { username: mira.username, password } });
    const before = await signIn(prepared?.password as string);
    const oldSession = caller(
      `__Host-session=${before.headers.get('Set-Cookie')?.match(/__Host-session=([^;]*)/)?.[1]}`,
    );

    const fresh = generateStudentPassword();
    const reset = await pedagog.call(`${base}/students/${mira.id}/password`, {
      method: 'POST',
      body: { passwordHash: await hashPassword(fresh) },
    });
    expect(reset.status).toBe(204);
    expect((await oldSession('/me')).status).toBe(401);
    expect((await signIn(prepared?.password as string)).status).toBe(401);
    expect((await signIn(fresh)).status).toBe(200);
  });

  it('refuses to touch staff or anyone outside the group', async () => {
    const { seed, pedagog, base } = await setup();
    const assistant = await account(seed, 'assistant', { groupId: seed.group.id });
    const passwordHash = await hashPassword(generateStudentPassword());
    const staff = await pedagog.call(`${base}/students/${assistant.user.id}/password`, {
      method: 'POST',
      body: { passwordHash },
    });
    expect(staff.status).toBe(404);
    expect(
      (await pedagog.call(`${base}/students/${seed.user.id}/password`, { method: 'POST', body: { passwordHash } }))
        .status,
    ).toBe(404);
  });
});

describe("D1's limit of 100 bound parameters per statement", () => {
  it(`holds for every insert of an import (${ROWS_PER_INSERT} rows each)`, () => {
    const db = createDb(env.DB);
    const rows = Array.from({ length: ROWS_PER_INSERT }, (_, i) => ({
      id: uuidv7(),
      fullName: `Emri Mbiemri ${i}`,
      username: `emri.mbiemri${i}`,
      passwordHash: 'pbkdf2-sha256$15000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    }));
    const userInsert = db.insert(users).values(rows).toSQL();
    const membershipInsert = db
      .insert(memberships)
      .values(rows.map((r) => ({ id: uuidv7(), orgId: uuidv7(), userId: r.id, groupId: uuidv7(), role: 'student' })))
      .toSQL();
    expect(userInsert.params.length).toBeLessThanOrEqual(100);
    expect(membershipInsert.params.length).toBeLessThanOrEqual(100);
  });
});

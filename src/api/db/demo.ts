import { and, asc, eq, inArray, ne, type SQL, sql } from 'drizzle-orm';
import { DEMO_ACCOUNTS, DEMO_SLUG } from '../../shared/demo';
import { generateJoinCode } from '../../shared/join-code';
import { findOrganizationBySlug } from './access';
import { uuidv7 } from './ids';
import { batchRaw, type Db } from './index';
import { courses, exercises, labs, memberships, notebooks, sessions, users } from './schema';
import { copyCourse } from './sharing';

// The demo institution (#216), rebuilt every night and on the owner's request. Its oldest course is
// the template, imported once by the owner; each reset deletes the other courses (with everything
// visitors did in them), copies the template into a fresh course, opens its labs, and gives it a group
// of made-up classmates with some activity, exercises solved, a hand-in and a released grade, so every
// screen has something to show. No real person is in it. Writes go as one INSERT … SELECT per table,
// from JSON, so a reset stays within the free plan's statements per request.

/** Made-up classmates: algorithm words as surnames, so nobody takes them for real people. */
const CLASSMATES: [string, string][] = [
  ['demo.ana', 'Ana Grafi'],
  ['demo.blerim', 'Blerim Kulmi'],
  ['demo.dea', 'Dea Rradha'],
  ['demo.erion', 'Erion Stiva'],
  ['demo.flora', 'Flora Pema'],
  ['demo.gent', 'Gent Brinja'],
  ['demo.hana', 'Hana Rruga'],
  ['demo.ilir', 'Ilir Nyja'],
  ['demo.jona', 'Jona Renditja'],
  ['demo.klea', 'Klea Fluksi'],
  ['demo.luan', 'Luan Cikli'],
];

/** The same "random" numbers on every reset, so the demo looks the same each morning. */
const pseudo = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/** One INSERT … SELECT of many rows from a JSON parameter; keys are the columns. */
function insertRows(table: string, rows: Record<string, unknown>[]): SQL | null {
  const columns = Object.keys(rows[0] ?? {});
  if (!columns.length) return null;
  const values = columns.map((c) => sql.raw(`json_extract(value, '$.${c}')`));
  return sql`INSERT INTO ${sql.raw(table)} (${sql.raw(columns.join(', '))})
    SELECT ${sql.join(values, sql`, `)} FROM json_each(${JSON.stringify(rows)})`;
}

/** Rebuilds the demo. Null when there is no demo institution, or no template course in it yet. */
export async function resetDemo(db: Db, now = new Date()): Promise<{ courseId: string } | null> {
  const org = await findOrganizationBySlug(db, DEMO_SLUG);
  if (!org) return null;
  const [template] = await db
    .select()
    .from(courses)
    .where(eq(courses.orgId, org.id))
    .orderBy(asc(courses.createdAt), asc(courses.id))
    .limit(1);
  if (!template) return null;

  // The accounts: made once, without passwords. A username already taken by someone in another
  // institution is left alone (that classmate is simply missing).
  const wanted: [string, string][] = [
    [DEMO_ACCOUNTS.pedagog.username, DEMO_ACCOUNTS.pedagog.fullName],
    [DEMO_ACCOUNTS.student.username, DEMO_ACCOUNTS.student.fullName],
    ...CLASSMATES,
  ];
  const names = wanted.map(([username]) => username);
  const [found, elsewhere] = await db.batch([
    db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.username, names)),
    db
      .select({ username: users.username })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(inArray(users.username, names), ne(memberships.orgId, org.id))),
  ]);
  const taken = new Set(elsewhere.map((row) => row.username));
  const missing = wanted
    .filter(([username]) => !found.some((u) => u.username === username))
    .map(([username, fullName]) => ({ id: uuidv7(), username, fullName }));
  if (missing.length) await db.insert(users).values(missing);
  const ids = new Map(
    [...found, ...missing].filter((u) => !taken.has(u.username)).map((u) => [u.username, u.id] as const),
  );
  const pedagog = ids.get(DEMO_ACCOUNTS.pedagog.username);
  if (!pedagog) return null;
  const demoUsers = [...ids.values()];

  // Yesterday's demo goes: its courses (and everything in them), its accounts' places and sign-ins.
  await db.batch([
    db.delete(courses).where(and(eq(courses.orgId, org.id), ne(courses.id, template.id))),
    db.delete(memberships).where(and(eq(memberships.orgId, org.id), inArray(memberships.userId, demoUsers))),
    db.delete(sessions).where(inArray(sessions.userId, demoUsers)),
  ]);

  const courseId = await copyCourse(
    db,
    {
      orgId: org.id,
      courseId: template.id,
      title: template.title,
      academicYear: template.academicYear,
      institution: org.name,
      solutions: true,
      templateId: template.templateId,
    },
    { orgId: org.id, creatorId: pedagog, title: template.title, academicYear: template.academicYear },
  );

  const [labRows, notebookRows, exerciseRows] = await db.batch([
    db
      .select({ id: labs.id, position: labs.position })
      .from(labs)
      .where(and(eq(labs.orgId, org.id), eq(labs.courseId, courseId)))
      .orderBy(asc(labs.position), asc(labs.n)),
    db
      .select({ id: notebooks.id, labId: notebooks.labId, kind: notebooks.kind })
      .from(notebooks)
      .innerJoin(labs, and(eq(labs.id, notebooks.labId), eq(labs.orgId, notebooks.orgId)))
      .where(and(eq(notebooks.orgId, org.id), eq(labs.courseId, courseId)))
      .orderBy(asc(notebooks.position)),
    db
      .select({ notebookId: exercises.notebookId, cell: exercises.cell })
      .from(exercises)
      .innerJoin(notebooks, and(eq(notebooks.id, exercises.notebookId), eq(notebooks.orgId, exercises.orgId)))
      .innerJoin(labs, and(eq(labs.id, notebooks.labId), eq(labs.orgId, notebooks.orgId)))
      .where(and(eq(exercises.orgId, org.id), eq(labs.courseId, courseId)))
      .orderBy(asc(exercises.cell)),
  ]);

  const groupId = uuidv7();
  const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
  const dayOf = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);
  const classmates = CLASSMATES.flatMap(([username], i) => {
    const id = ids.get(username);
    return id ? [{ id, i }] : [];
  });
  const student = ids.get(DEMO_ACCOUNTS.student.username);
  const members = [...(student ? [student] : []), ...classmates.map((c) => c.id)];

  // How far each classmate got: between a third of the labs and all of them.
  const reached = (i: number) => Math.max(1, Math.round(labRows.length * (0.35 + 0.65 * pseudo(i + 1))));
  const activity: Record<string, unknown>[] = [];
  const solved: Record<string, unknown>[] = [];
  for (const { id, i } of classmates) {
    for (const [k, lab] of labRows.slice(0, reached(i)).entries()) {
      // A lab a week, the latest this week.
      const daysAgo = (reached(i) - 1 - k) * 7 + Math.floor(pseudo(i * 31 + k) * 5);
      activity.push({ id: uuidv7(), org_id: org.id, lab_id: lab.id, user_id: id, kind: 'view', day: dayOf(daysAgo) });
      for (const nb of notebookRows.filter((n) => n.labId === lab.id && n.kind !== 'solution')) {
        for (const ex of exerciseRows.filter((e) => e.notebookId === nb.id)) {
          if (pseudo(i * 97 + ex.cell) < 0.7) {
            solved.push({ id: uuidv7(), org_id: org.id, notebook_id: nb.id, cell: ex.cell, user_id: id });
          }
        }
      }
    }
  }

  // A hand-in and a released grade on the first notebook with exercises, for those who reached it.
  const graded = notebookRows.find((nb) => nb.kind !== 'solution' && exerciseRows.some((e) => e.notebookId === nb.id));
  const handIns: Record<string, unknown>[] = [];
  const grades: Record<string, unknown>[] = [];
  if (graded) {
    const cells = exerciseRows.filter((e) => e.notebookId === graded.id).map((e) => e.cell);
    for (const { id } of classmates) {
      const done = solved.filter((s) => s.user_id === id && s.notebook_id === graded.id).map((s) => s.cell as number);
      if (!done.length) continue;
      handIns.push({
        id: uuidv7(),
        org_id: org.id,
        notebook_id: graded.id,
        user_id: id,
        code: [],
        solved: done,
        attempts: 1,
        submitted_at: seconds(now) - 3 * 86_400,
      });
      grades.push({
        id: uuidv7(),
        org_id: org.id,
        notebook_id: graded.id,
        user_id: id,
        auto_score: done.length,
        max_score: cells.length,
        results: cells.map((cell) => ({ cell, status: done.includes(cell) ? 'pass' : 'fail' })),
        graded_at: seconds(now) - 2 * 86_400,
        released_at: seconds(now) - 2 * 86_400,
      });
    }
  }

  const statements = [
    sql`INSERT INTO groups (id, org_id, course_id, name, join_code)
        VALUES (${groupId}, ${org.id}, ${courseId}, 'Grupi A', ${generateJoinCode()})`,
    // No "Copied from": the demo course is the course.
    sql`UPDATE courses SET copied_from_course_id = NULL, copied_from_title = NULL, copied_from_institution = NULL
        WHERE org_id = ${org.id} AND id = ${courseId}`,
    insertRows(
      'memberships',
      members.map((userId) => ({ id: uuidv7(), org_id: org.id, user_id: userId, group_id: groupId, role: 'student' })),
    ),
    // Every lab open to the course, solutions too: a visitor sees all there is.
    insertRows(
      'lab_access',
      labRows.map((lab) => ({
        id: uuidv7(),
        org_id: org.id,
        lab_id: lab.id,
        visible_from: seconds(now) - 86_400,
        solutions_from: seconds(now) - 86_400,
      })),
    ),
    insertRows('lab_activity', activity),
    insertRows('exercise_completions', solved),
    insertRows('submissions', handIns),
    insertRows('grades', grades),
  ].filter((s): s is SQL => s !== null);
  await batchRaw(db, statements);
  return { courseId };
}

/** The current demo course: the newest one its pedagog teaches. */
export async function demoCourse(db: Db) {
  const org = await findOrganizationBySlug(db, DEMO_SLUG);
  if (!org) return null;
  const [row] = await db
    .select({ id: courses.id })
    .from(courses)
    .innerJoin(memberships, and(eq(memberships.courseId, courses.id), eq(memberships.orgId, courses.orgId)))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(courses.orgId, org.id), eq(users.username, DEMO_ACCOUNTS.pedagog.username)))
    .orderBy(sql`${courses.createdAt} DESC`)
    .limit(1);
  return row ? { orgId: org.id, courseId: row.id } : null;
}

/** A demo account's id, to sign a visitor in to it. */
export async function demoAccountId(db: Db, username: string) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  return row?.id;
}

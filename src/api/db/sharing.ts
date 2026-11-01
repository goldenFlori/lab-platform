import { and, asc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import type { SharePreview } from '../../shared/sharing';
import { uuidv7 } from './ids';
import { batchRaw, type Db } from './index';
import { courseShares, courses, labs, memberships, notebooks, organizations } from './schema';

// Copying a shared course into another institution (#203). The share's token is the author's
// permission, so this reads across organizations by design, like a join code; it writes only into
// the institution the copy is for. Content alone is copied: labs, ready notebooks with their files,
// visualizations, exercises and search index, and with `solutions` the solution notebooks and the
// graded exercises' points and hidden tests. Never groups, people, visibility, work or grades.

export type Share = {
  orgId: string;
  courseId: string;
  solutions: boolean;
  title: string;
  academicYear: string;
  institution: string;
};

/** A new share token: 128 random bits as hex. */
export function newShareToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The course a token shares, with its institution's name. */
export async function findShare(db: Db, token: string): Promise<Share | undefined> {
  const [row] = await db
    .select({
      orgId: courseShares.orgId,
      courseId: courseShares.courseId,
      solutions: courseShares.solutions,
      title: courses.title,
      academicYear: courses.academicYear,
      institution: organizations.name,
    })
    .from(courseShares)
    .innerJoin(courses, and(eq(courses.id, courseShares.courseId), eq(courses.orgId, courseShares.orgId)))
    .innerJoin(organizations, eq(organizations.id, courseShares.orgId))
    .where(eq(courseShares.token, token))
    .limit(1);
  return row;
}

/** The notebooks a share copies: ready ones, and solution notebooks only when it includes solutions. */
function sharedNotebooks(share: Share) {
  return and(
    eq(notebooks.orgId, share.orgId),
    isNotNull(notebooks.readyAt),
    share.solutions ? undefined : ne(notebooks.kind, 'solution'),
  );
}

/** The shared course's labs in teaching order, each with how many notebooks the copy would bring. */
export async function sharedLabs(db: Db, share: Share): Promise<SharePreview['labs']> {
  const rows = await db
    .select({ title: labs.title, notebooks: sql<number>`count(${notebooks.id})` })
    .from(labs)
    .leftJoin(notebooks, and(eq(notebooks.labId, labs.id), sharedNotebooks(share)))
    .where(and(eq(labs.orgId, share.orgId), eq(labs.courseId, share.courseId)))
    .groupBy(labs.id)
    .orderBy(asc(labs.position), asc(labs.n));
  return rows;
}

/** The user's institutions where they may create courses: an institution-wide role with course.create. */
export async function shareDestinations(db: Db, userId: string): Promise<SharePreview['destinations']> {
  return db.all<{ slug: string; name: string }>(sql`
    SELECT DISTINCT o.slug, o.name
    FROM memberships m
    JOIN roles r ON r.key = m.role
    JOIN organizations o ON o.id = m.org_id
    WHERE m.user_id = ${userId} AND m.course_id IS NULL AND m.group_id IS NULL
      AND EXISTS (SELECT 1 FROM json_each(r.capabilities) WHERE value = 'course.create')
    ORDER BY o.name`);
}

/** The institutions that copied a course, for its author: names, years and dates, nothing more. */
export async function copiesOf(db: Db, courseId: string) {
  return db
    .select({ institution: organizations.name, academicYear: courses.academicYear, copiedAt: courses.createdAt })
    .from(courses)
    .innerJoin(organizations, eq(organizations.id, courses.orgId))
    .where(eq(courses.copiedFromCourseId, courseId))
    .orderBy(asc(courses.createdAt));
}

/**
 * Copies a course into a new course of `into.orgId`, with `creatorId` as its pedagog, in one batch:
 * all of it or nothing. The source is a share (#203) or, within one institution, the course a new
 * term starts from (#210), which also keeps its template. The rows are copied inside the database
 * (INSERT … SELECT), so the files' bytes never pass through the Worker and the statement count stays
 * fixed however large the course is. Old ids map to new ones through JSON parameters; the rows under a
 * notebook get new ids made by SQL, in the same UUIDv7 form as the rest.
 */
export async function copyCourse(
  db: Db,
  share: Share & { templateId?: string | null },
  into: { orgId: string; creatorId: string; title: string; academicYear: string; locale?: 'sq' | 'en' | null },
) {
  const [sourceLabs, sourceNotebooks] = await db.batch([
    db
      .select({ id: labs.id })
      .from(labs)
      .where(and(eq(labs.orgId, share.orgId), eq(labs.courseId, share.courseId))),
    db
      .select({ id: notebooks.id })
      .from(notebooks)
      .innerJoin(labs, and(eq(labs.id, notebooks.labId), eq(labs.orgId, notebooks.orgId)))
      .where(and(sharedNotebooks(share), eq(labs.courseId, share.courseId))),
  ]);
  const labMap = JSON.stringify(sourceLabs.map((l) => ({ o: l.id, n: uuidv7() })));
  const notebookMap = JSON.stringify(sourceNotebooks.map((n) => ({ o: n.id, n: uuidv7() })));
  const src = share.orgId;
  const dst = into.orgId;
  const courseId = uuidv7();
  // A UUIDv7 per row: this moment's milliseconds, then random bits with the version and variant.
  const prefix = uuidv7().slice(0, 14);
  const newId = sql`lower(${prefix} || '7' || substr(hex(randomblob(2)), 2) || '-'
    || substr('89AB', 1 + abs(random() % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))`;
  const mapOf = (json: string) =>
    sql`(SELECT json_extract(value, '$.o') AS o, json_extract(value, '$.n') AS n FROM json_each(${json}))`;
  const lm = mapOf(labMap);
  const nm = mapOf(notebookMap);

  const statements: Parameters<typeof batchRaw>[1] = [
    db
      .insert(courses)
      .values({
        id: courseId,
        orgId: dst,
        title: into.title,
        academicYear: into.academicYear,
        locale: into.locale ?? null,
        // A template is an institution's own: a new term keeps it, a copy elsewhere starts without.
        templateId: share.orgId === into.orgId ? (share.templateId ?? null) : null,
        copiedFromCourseId: share.courseId,
        copiedFromTitle: share.title,
        copiedFromInstitution: share.institution,
      })
      .toSQL(),
    db
      .insert(memberships)
      .values({ id: uuidv7(), orgId: dst, userId: into.creatorId, courseId, role: 'pedagog' })
      .toSQL(),
    // Each statement starts from its id map (CROSS JOIN keeps that order in SQLite) and finds the
    // source rows by index, so it reads only the shared course's rows.
    sql`
      INSERT INTO labs (id, org_id, course_id, n, title, week, summary, position)
      SELECT m.n, ${dst}, ${courseId}, l.n, l.title, l.week, l.summary, l.position
      FROM ${lm} m CROSS JOIN labs l ON l.id = m.o AND l.org_id = ${src}`,
    sql`
      INSERT INTO notebooks (id, org_id, lab_id, kind, title, position, original_name, sha256, ready_at)
      SELECT m.n, ${dst}, lab.n, nb.kind, nb.title, nb.position, nb.original_name, nb.sha256, nb.ready_at
      FROM ${nm} m CROSS JOIN notebooks nb ON nb.id = m.o AND nb.org_id = ${src}
      JOIN ${lm} lab ON lab.o = nb.lab_id`,
    sql`
      INSERT INTO files (id, org_id, notebook_id, name, mime, encoding, size, chunk_count)
      SELECT ${newId}, ${dst}, m.n, f.name, f.mime, f.encoding, f.size, f.chunk_count
      FROM ${nm} m CROSS JOIN files f ON f.org_id = ${src} AND f.notebook_id = m.o`,
    // Each chunk finds its new file by the new notebook and the file's name, unique within it.
    sql`
      INSERT INTO file_chunks (org_id, file_id, n, data)
      SELECT ${dst}, nf.id, c.n, c.data
      FROM ${nm} m
      CROSS JOIN files f ON f.org_id = ${src} AND f.notebook_id = m.o
      CROSS JOIN files nf ON nf.org_id = ${dst} AND nf.notebook_id = m.n AND nf.name = f.name
      CROSS JOIN file_chunks c ON c.org_id = ${src} AND c.file_id = f.id`,
    sql`
      INSERT INTO embeds (id, org_id, notebook_id, cell, viz, title, props)
      SELECT ${newId}, ${dst}, m.n, e.cell, e.viz, e.title, e.props
      FROM ${nm} m CROSS JOIN embeds e ON e.org_id = ${src} AND e.notebook_id = m.o`,
    sql`
      INSERT INTO exercises (id, org_id, notebook_id, cell, title, test, ai_mode)
      SELECT ${newId}, ${dst}, m.n, x.cell, x.title, x.test, x.ai_mode
      FROM ${nm} m CROSS JOIN exercises x ON x.org_id = ${src} AND x.notebook_id = m.o`,
    sql`
      INSERT INTO search_sections (id, org_id, notebook_id, position, anchor, title, text, keywords)
      SELECT ${newId}, ${dst}, m.n, s.position, s.anchor, s.title, s.text, s.keywords
      FROM ${nm} m CROSS JOIN search_sections s ON s.org_id = ${src} AND s.notebook_id = m.o`,
  ];
  // Points and hidden tests tell how an exercise is graded, which is as good as its solution.
  if (share.solutions)
    statements.push(
      sql`
    INSERT INTO exercise_grading (id, org_id, notebook_id, cell, points, hidden_test)
    SELECT ${newId}, ${dst}, m.n, g.cell, g.points, g.hidden_test
    FROM ${nm} m CROSS JOIN exercise_grading g ON g.org_id = ${src} AND g.notebook_id = m.o`,
    );
  await batchRaw(db, statements);
  return courseId;
}

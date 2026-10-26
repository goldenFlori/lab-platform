import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  type InferInsertModel,
  type InferSelectModel,
  inArray,
  isNotNull,
  isNull,
  like,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { ActivityKind } from '../../shared/activity';
import type { AiQuestion } from '../../shared/ai';
import type { AiMode } from '../../shared/exercise-limits';
import type { DeletionRequestView, ErasureView, OrganizationData, PersonGrade } from '../../shared/my-data';
import type { ExportPage, ExportPart } from '../../shared/org-export';
import type { PredictionInput } from '../../shared/predictions';
import { roleExists } from './access';
import { uuidv7 } from './ids';
import type { Db } from './index';
import {
  aiQuestions,
  aiUsage,
  assignments,
  codeEdits,
  courses,
  courseTemplates,
  deletionRequests,
  embeds,
  erasures,
  exerciseCompletions,
  exerciseGrading,
  exercises,
  fileChunks,
  files,
  grades,
  groups,
  labAccess,
  labActivity,
  labs,
  liveSessions,
  memberships,
  notebooks,
  predictionResults,
  searchSections,
  sessions,
  submissions,
  surveyComments,
  surveyRatings,
  surveyRespondents,
  surveys,
  traceAnswers,
  users,
} from './schema';

// The tenant-scoped data layer. Route handlers reach tenant-owned data only through forTenant(),
// which adds the organization to every query. Another organization's rows look like rows that do
// not exist: reads return undefined, writes throw NotFoundError, and handlers answer 404.

/** The resource does not exist, or belongs to another organization. Handlers answer 404. */
export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** The request asks for something impossible, such as a role that does not exist. Handlers answer 400. */
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInputError';
  }
}

async function assertRole(db: Db, role: string) {
  if (!(await roleExists(db, role))) throw new InvalidInputError(`Unknown role: ${role}`);
}

type TenantTable =
  | typeof courseTemplates
  | typeof courses
  | typeof groups
  | typeof labs
  | typeof labAccess
  | typeof memberships
  | typeof notebooks
  | typeof embeds;

// $inferSelect / $inferInsert rather than InferSelectModel<T>: over a union of tables, the latter
// loses the optional columns.
type Row<T extends TenantTable> = T['$inferSelect'];
type NewRow<T extends TenantTable> = Omit<T['$inferInsert'], 'id' | 'orgId' | 'createdAt'>;
type Changes<T extends TenantTable> = Partial<NewRow<T>>;

/** A foreign key pointed at a row that is missing or, thanks to (parent_id, org_id), in another organization. */
function isForeignKeyError(error: unknown) {
  const text = `${error instanceof Error ? error.message : ''} ${error instanceof Error ? String(error.cause ?? '') : ''}`;
  return text.includes('FOREIGN KEY constraint failed');
}

async function rethrowMissingParent<R>(write: Promise<R>): Promise<R> {
  try {
    return await write;
  } catch (error) {
    if (isForeignKeyError(error)) throw new NotFoundError('A referenced resource was not found');
    throw error;
  }
}

/** Keeps callers from moving a row to another id or organization, whatever the types allowed. */
function withoutKeys(values: object) {
  const { id: _id, orgId: _orgId, createdAt: _createdAt, ...rest } = values as Record<string, unknown>;
  return rest;
}

function tenantTable<T extends TenantTable>(db: Db, orgId: string, table: T) {
  // The cast lets one implementation serve every table; the public types stay specific to T.
  const t = table as TenantTable;
  const inTenant = (...conditions: (SQL | undefined)[]) => and(eq(t.orgId, orgId), ...conditions);

  return {
    async list(where?: SQL): Promise<Row<T>[]> {
      return (await db.select().from(t).where(inTenant(where))) as Row<T>[];
    },

    async get(id: string): Promise<Row<T> | undefined> {
      const [row] = await db
        .select()
        .from(t)
        .where(inTenant(eq(t.id, id)))
        .limit(1);
      return row as Row<T> | undefined;
    },

    async create(values: NewRow<T>): Promise<Row<T>> {
      const row = { ...withoutKeys(values), id: uuidv7(), orgId } as InferInsertModel<TenantTable>;
      const [created] = await rethrowMissingParent(db.insert(t).values(row).returning());
      return created as Row<T>;
    },

    async update(id: string, changes: Changes<T>): Promise<Row<T> | undefined> {
      const set = withoutKeys(changes) as Partial<InferInsertModel<TenantTable>>;
      if (Object.keys(set).length === 0) return this.get(id);
      const [updated] = await rethrowMissingParent(
        db
          .update(t)
          .set(set)
          .where(inTenant(eq(t.id, id)))
          .returning(),
      );
      return updated as Row<T> | undefined;
    },

    async remove(id: string): Promise<boolean> {
      const deleted = await db
        .delete(t)
        .where(inTenant(eq(t.id, id)))
        .returning({ id: t.id });
      return deleted.length > 0;
    },
  };
}

/** What a tenant may see of a user: never the password hash. */
const publicUser = {
  id: users.id,
  username: users.username,
  fullName: users.fullName,
  email: users.email,
  status: users.status,
  createdAt: users.createdAt,
};

export type TenantUser = { [K in keyof typeof publicUser]: InferSelectModel<typeof users>[K] };

type NewUser = Pick<InferInsertModel<typeof users>, 'username' | 'fullName' | 'email' | 'passwordHash'>;

/** Users are global; an organization sees only the users who hold a membership in it. */
function tenantUsers(db: Db, orgId: string) {
  const memberIds = db.select({ id: memberships.userId }).from(memberships).where(eq(memberships.orgId, orgId));

  return {
    async list(): Promise<TenantUser[]> {
      return db.select(publicUser).from(users).where(inArray(users.id, memberIds));
    },

    async get(id: string): Promise<TenantUser | undefined> {
      const [user] = await db
        .select(publicUser)
        .from(users)
        .where(and(eq(users.id, id), inArray(users.id, memberIds)))
        .limit(1);
      return user;
    },

    /** Creates the account and its membership in this organization together. */
    async create(values: NewUser, role: string): Promise<TenantUser> {
      await assertRole(db, role);
      const id = uuidv7();
      await db.batch([
        db.insert(users).values({ ...values, id, username: values.username.toLowerCase() }),
        db.insert(memberships).values({ id: uuidv7(), orgId, userId: id, role }),
      ]);
      const user = await this.get(id);
      if (!user) throw new Error('The new user could not be read back');
      return user;
    },
  };
}

/** Memberships can only be given to users who already belong to this organization. */
function tenantMemberships(db: Db, orgId: string, members: ReturnType<typeof tenantUsers>) {
  const base = tenantTable(db, orgId, memberships);
  return {
    ...base,
    async create(values: NewRow<typeof memberships>) {
      if (!(await members.get(values.userId))) throw new NotFoundError('User not found');
      await assertRole(db, values.role);
      return base.create(values);
    },
    async update(id: string, changes: Changes<typeof memberships>) {
      if (changes.role !== undefined) await assertRole(db, changes.role);
      return base.update(id, changes);
    },
  };
}

/** Courses, plus creating one together with its first pedagog and, when copying, last year's labs. */
function tenantCourses(db: Db, orgId: string) {
  const base = tenantTable(db, orgId, courses);
  return {
    ...base,
    async createFor(creatorId: string, values: { title: string; academicYear: string }, copyFromId?: string) {
      const source = copyFromId ? await base.get(copyFromId) : undefined;
      if (copyFromId && !source) throw new NotFoundError('Course not found');
      const sourceLabs = source
        ? await db
            .select()
            .from(labs)
            .where(and(eq(labs.orgId, orgId), eq(labs.courseId, source.id)))
            .orderBy(asc(labs.position))
        : [];

      const id = uuidv7();
      const course = db.insert(courses).values({ ...values, id, orgId, templateId: source?.templateId ?? null });
      const creator = db
        .insert(memberships)
        .values({ id: uuidv7(), orgId, userId: creatorId, courseId: id, role: 'pedagog' });
      const copiedLabs = sourceLabs.map(({ n, title, week, summary, position }) => ({
        id: uuidv7(),
        orgId,
        courseId: id,
        n,
        title,
        week,
        summary,
        position,
      }));
      // One batch: the course, its pedagog and its labs exist together or not at all.
      if (copiedLabs.length > 0) await db.batch([course, creator, db.insert(labs).values(copiedLabs)]);
      else await db.batch([course, creator]);

      const created = await base.get(id);
      if (!created) throw new Error('The new course could not be read back');
      return created;
    },
  };
}

function tenantGroups(db: Db, orgId: string) {
  const base = tenantTable(db, orgId, groups);
  return {
    ...base,
    ofCourse(courseId: string) {
      return base.list(eq(groups.courseId, courseId));
    },
  };
}

function tenantLabs(db: Db, orgId: string) {
  const base = tenantTable(db, orgId, labs);
  return {
    ...base,
    async ofCourse(courseId: string) {
      const rows = await base.list(eq(labs.courseId, courseId));
      return rows.sort((a, b) => a.position - b.position || a.n - b.n);
    },
  };
}

type Rule = { visibleFrom: Date | null; visibleUntil: Date | null; solutionsFrom: Date | null };

/** When labs are open (#12): one rule per lab and group, or per lab for the whole course. */
function tenantLabAccess(db: Db, orgId: string) {
  const base = tenantTable(db, orgId, labAccess);
  const ruleOf = (labId: string, groupId: string | null) =>
    and(eq(labAccess.labId, labId), groupId === null ? isNull(labAccess.groupId) : eq(labAccess.groupId, groupId));
  return {
    ...base,
    /** Every rule of a course's labs, in one query (by course, so the parameter count stays fixed). */
    ofCourse(courseId: string) {
      return db
        .select({
          labId: labAccess.labId,
          groupId: labAccess.groupId,
          visibleFrom: labAccess.visibleFrom,
          visibleUntil: labAccess.visibleUntil,
          solutionsFrom: labAccess.solutionsFrom,
        })
        .from(labAccess)
        .innerJoin(labs, and(eq(labs.id, labAccess.labId), eq(labs.orgId, labAccess.orgId)))
        .where(and(eq(labAccess.orgId, orgId), eq(labs.courseId, courseId)));
    },

    async setRule(labId: string, groupId: string | null, rule: Rule) {
      const [existing] = await base.list(ruleOf(labId, groupId));
      if (existing) return base.update(existing.id, rule);
      return base.create({ labId, groupId, ...rule });
    },

    /** Back to the course-wide rule for this group. */
    async removeRule(labId: string, groupId: string) {
      const [existing] = await base.list(ruleOf(labId, groupId));
      if (existing) await base.remove(existing.id);
    },
  };
}

/** Bytes per stored chunk: well under D1's 2 MB per value. */
export const CHUNK_BYTES = 512 * 1024;

export type StoredFile = { mime: string; encoding: 'identity' | 'gzip'; size: number; data: Uint8Array };

/** A lab's notebooks (#14), with their files in chunks and their embeds. */
function tenantNotebooks(db: Db, orgId: string) {
  const base = tenantTable(db, orgId, notebooks);
  const embedRows = tenantTable(db, orgId, embeds);
  const fileOf = (notebookId: string, name: string) =>
    and(eq(files.orgId, orgId), eq(files.notebookId, notebookId), eq(files.name, name));

  return {
    ...base,
    async ofLab(labId: string) {
      const rows = await base.list(eq(notebooks.labId, labId));
      return rows.sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime());
    },

    /** Stores (or replaces) a file of the notebook: one file row and its chunks, written together. */
    async putFile(notebookId: string, name: string, file: Omit<StoredFile, 'size'>) {
      const id = uuidv7();
      const chunks = Array.from({ length: Math.ceil(file.data.length / CHUNK_BYTES) }, (_, n) => ({
        orgId,
        fileId: id,
        n,
        data: file.data.subarray(n * CHUNK_BYTES, (n + 1) * CHUNK_BYTES),
      }));
      await rethrowMissingParent(
        db.batch([
          db.delete(files).where(fileOf(notebookId, name)),
          db.insert(files).values({
            id,
            orgId,
            notebookId,
            name,
            mime: file.mime,
            encoding: file.encoding,
            size: file.data.length,
            chunkCount: chunks.length,
          }),
          ...chunks.map((chunk) => db.insert(fileChunks).values(chunk)),
        ]),
      );
    },

    async getFile(notebookId: string, name: string): Promise<StoredFile | undefined> {
      const [file] = await db.select().from(files).where(fileOf(notebookId, name)).limit(1);
      if (!file) return undefined;
      const chunks = await db
        .select({ data: fileChunks.data })
        .from(fileChunks)
        .where(and(eq(fileChunks.orgId, orgId), eq(fileChunks.fileId, file.id)))
        .orderBy(asc(fileChunks.n));
      const data = new Uint8Array(file.size);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk.data, offset);
        offset += chunk.data.length;
      }
      return { mime: file.mime, encoding: file.encoding, size: file.size, data };
    },

    async fileNames(notebookId: string) {
      const rows = await db
        .select({ name: files.name })
        .from(files)
        .where(and(eq(files.orgId, orgId), eq(files.notebookId, notebookId)));
      return rows.map((row) => row.name);
    },

    /** The ready and unfinished notebooks of these labs, in each lab's order. */
    async ofLabs(labIds: string[]) {
      const rows = (
        await Promise.all(inChunks(labIds, IDS_PER_QUERY).map((ids) => base.list(inArray(notebooks.labId, ids))))
      ).flat();
      return rows.sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime());
    },

    embedsOf(notebookId: string) {
      return embedRows.list(eq(embeds.notebookId, notebookId));
    },

    /** The embeds of several notebooks at once. */
    async embedsOfNotebooks(notebookIds: string[]) {
      return (
        await Promise.all(
          inChunks(notebookIds, IDS_PER_QUERY).map((ids) => embedRows.list(inArray(embeds.notebookId, ids))),
        )
      ).flat();
    },

    /** Replaces all embeds of the notebook at once. */
    async setEmbeds(
      notebookId: string,
      list: { cell: number; viz: string; title: string | null; props: Record<string, unknown> | null }[],
    ) {
      const rows = list.map((embed) => ({ ...embed, id: uuidv7(), orgId, notebookId }));
      await rethrowMissingParent(
        db.batch([
          db.delete(embeds).where(and(eq(embeds.orgId, orgId), eq(embeds.notebookId, notebookId))),
          ...inChunks(rows).map((chunk) => db.insert(embeds).values(chunk)),
        ]),
      );
    },

    /** Replaces the notebook's search index (#17) at once: at most 400 sections, 41 statements. */
    async setSearchSections(
      notebookId: string,
      list: { anchor: string | null; title: string; text: string; keywords: string }[],
    ) {
      const rows = list.map((section, position) => ({ ...section, position, id: uuidv7(), orgId, notebookId }));
      await rethrowMissingParent(
        db.batch([
          db
            .delete(searchSections)
            .where(and(eq(searchSections.orgId, orgId), eq(searchSections.notebookId, notebookId))),
          ...inChunks(rows).map((chunk) => db.insert(searchSections).values(chunk)),
        ]),
      );
    },

    /** The search index of these notebooks, each in its order. */
    async searchSectionsOf(notebookIds: string[]) {
      const rows = await Promise.all(
        inChunks(notebookIds, IDS_PER_QUERY).map((ids) =>
          db
            .select({
              notebookId: searchSections.notebookId,
              anchor: searchSections.anchor,
              title: searchSections.title,
              text: searchSections.text,
              keywords: searchSections.keywords,
            })
            .from(searchSections)
            .where(and(eq(searchSections.orgId, orgId), inArray(searchSections.notebookId, ids)))
            .orderBy(asc(searchSections.notebookId), asc(searchSections.position)),
        ),
      );
      return rows.flat();
    },
  };
}

/** Rows per multi-row insert, so each statement stays under D1's 100 bound parameters. */
export const ROWS_PER_INSERT = 10;
/** Ids per `IN (…)` list, leaving room under the 100 bound parameters for the organization. */
const IDS_PER_QUERY = 90;

function inChunks<T>(list: T[], size = ROWS_PER_INSERT) {
  return Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
}

type NewStudent = { fullName: string; username: string; passwordHash: string };

/** Students of a group: imported accounts, their list, and password resets by staff (#11). */
/** The account rows to insert: each username numbered where it is already taken ("ana.kola2"). */
async function freeUsernames(db: Db, rows: NewStudent[]) {
  const bases = [...new Set(rows.map((row) => row.username))];
  // Usernames are [a-z.] only, so the base contains no LIKE wildcards.
  const existing = await db
    .select({ username: users.username })
    .from(users)
    .where(or(...bases.map((base) => like(users.username, `${base}%`))));
  const taken = new Set(existing.map((row) => row.username));
  return rows.map((row) => {
    let username = row.username;
    for (let n = 2; taken.has(username); n++) username = `${row.username}${n}`;
    taken.add(username);
    return { id: uuidv7(), fullName: row.fullName, username, passwordHash: row.passwordHash };
  });
}

function tenantStudents(db: Db, orgId: string) {
  const withFreeUsernames = (rows: NewStudent[]) => freeUsernames(db, rows);

  return {
    async ofGroup(groupId: string) {
      return db
        .select({ id: users.id, fullName: users.fullName, username: users.username })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.orgId, orgId), eq(memberships.groupId, groupId), eq(memberships.role, 'student')))
        .orderBy(asc(users.fullName));
    },

    /**
     * New accounts, each only a student of the group: no organization-wide role, so they see this
     * course and nothing else. One select and a few multi-row inserts, written together.
     */
    async importInto(groupId: string, rows: NewStudent[]) {
      for (let attempt = 1; ; attempt++) {
        const accounts = await withFreeUsernames(rows);
        const statements = [
          ...inChunks(accounts).map((chunk) => db.insert(users).values(chunk)),
          ...inChunks(accounts).map((chunk) =>
            db
              .insert(memberships)
              .values(chunk.map((account) => ({ id: uuidv7(), orgId, userId: account.id, groupId, role: 'student' }))),
          ),
        ];
        const [first, ...rest] = statements;
        if (!first) return [];
        try {
          await rethrowMissingParent(db.batch([first, ...rest]));
          return accounts.map(({ id, fullName, username }) => ({ id, fullName, username }));
        } catch (error) {
          // Another import took one of these usernames meanwhile: pick again, once.
          if (attempt === 1 && String((error as Error).cause ?? error).includes('UNIQUE')) continue;
          throw error;
        }
      }
    },

    /** A new password for a student of the group; their other sessions end. */
    async setPassword(groupId: string, userId: string, passwordHash: string) {
      const [member] = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.orgId, orgId),
            eq(memberships.groupId, groupId),
            eq(memberships.userId, userId),
            eq(memberships.role, 'student'),
          ),
        )
        .limit(1);
      if (!member) throw new NotFoundError('Student not found');
      await db.batch([
        db.update(users).set({ passwordHash }).where(eq(users.id, userId)),
        db.delete(sessions).where(eq(sessions.userId, userId)),
      ]);
    },
  };
}

/** A student's rows of graded trace tables (#168): each user reads and writes only their own. */
function tenantTraceAnswers(db: Db, orgId: string) {
  const mine = (notebookId: string, userId: string) =>
    and(eq(traceAnswers.orgId, orgId), eq(traceAnswers.notebookId, notebookId), eq(traceAnswers.userId, userId));
  return {
    ofUser(notebookId: string, userId: string) {
      return db
        .select({ cell: traceAnswers.cell, rows: traceAnswers.rows })
        .from(traceAnswers)
        .where(mine(notebookId, userId))
        .orderBy(asc(traceAnswers.cell));
    },

    async save(row: { notebookId: string; userId: string; cell: number; rows: Record<string, string>[] }) {
      const updatedAt = new Date();
      await rethrowMissingParent(
        db
          .insert(traceAnswers)
          .values({ ...row, id: uuidv7(), orgId, updatedAt })
          .onConflictDoUpdate({
            target: [traceAnswers.orgId, traceAnswers.notebookId, traceAnswers.cell, traceAnswers.userId],
            set: { rows: row.rows, updatedAt },
          }),
      );
    },
  };
}

/** Students' own versions of code cells (#49): each user reads and writes only their own. */
function tenantCodeEdits(db: Db, orgId: string) {
  const mine = (notebookId: string, userId: string) =>
    and(eq(codeEdits.orgId, orgId), eq(codeEdits.notebookId, notebookId), eq(codeEdits.userId, userId));
  return {
    ofUser(notebookId: string, userId: string) {
      return db
        .select({ cell: codeEdits.cell, code: codeEdits.code, updatedAt: codeEdits.updatedAt })
        .from(codeEdits)
        .where(mine(notebookId, userId))
        .orderBy(asc(codeEdits.cell));
    },

    /** Saves the user's code for a cell, replacing what was there. */
    async save(row: { notebookId: string; userId: string; cell: number; code: string }) {
      const updatedAt = new Date();
      await rethrowMissingParent(
        db
          .insert(codeEdits)
          .values({ ...row, id: uuidv7(), orgId, updatedAt })
          .onConflictDoUpdate({
            target: [codeEdits.orgId, codeEdits.userId, codeEdits.notebookId, codeEdits.cell],
            set: { code: row.code, updatedAt },
          }),
      );
      return updatedAt;
    },

    /** Back to the original code: one cell, or every cell of the notebook. */
    async reset(notebookId: string, userId: string, cell?: number) {
      await db
        .delete(codeEdits)
        .where(cell === undefined ? mine(notebookId, userId) : and(mine(notebookId, userId), eq(codeEdits.cell, cell)));
    },
  };
}

/**
 * The students of a course's groups (all of its groups when `groupIds` is null): `students` as a
 * subquery of user ids, and `inGroups` as the condition on memberships.
 */
function studentsOf(db: Db, orgId: string, courseId: string, groupIds: string[] | null) {
  const inGroups =
    groupIds === null
      ? inArray(
          memberships.groupId,
          db
            .select({ id: groups.id })
            .from(groups)
            .where(and(eq(groups.orgId, orgId), eq(groups.courseId, courseId))),
        )
      : inArray(memberships.groupId, groupIds.length ? groupIds : ['']);
  const students = db
    .selectDistinct({ id: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, 'student'), inGroups));
  return { inGroups, students };
}

/**
 * First-try results of predictions and trace tables (#151): a student's first answer to each decision
 * of an embedded visualization. Students read their own per topic; staff only as counts.
 */
function tenantPredictions(db: Db, orgId: string) {
  const pr = predictionResults;
  const courseNotebooks = (courseId: string) =>
    db
      .select({ id: notebooks.id })
      .from(notebooks)
      .innerJoin(labs, and(eq(labs.id, notebooks.labId), eq(labs.orgId, orgId)))
      .where(and(eq(notebooks.orgId, orgId), eq(labs.courseId, courseId)));
  const right = sql<number>`coalesce(sum(${pr.correct}), 0)`;
  const total = sql<number>`count(*)`;
  return {
    /** Keeps the student's first answer to the decision; any later answer changes nothing. */
    async record(row: PredictionInput & { notebookId: string; cell: number; userId: string; day: string }) {
      const { right: correct, ...rest } = row;
      await rethrowMissingParent(
        db
          .insert(pr)
          .values({ ...rest, correct, id: uuidv7(), orgId })
          .onConflictDoNothing(),
      );
    },

    /** The student's own first-try results in a course, per topic. */
    async ofStudent(courseId: string, userId: string) {
      return db
        .select({ topic: pr.topic, asked: total, right })
        .from(pr)
        .where(and(eq(pr.orgId, orgId), eq(pr.userId, userId), inArray(pr.notebookId, courseNotebooks(courseId))))
        .groupBy(pr.topic);
    },

    /**
     * A course's results for the students of `groupIds` (all its groups when null): per embed, its
     * topics, students and answers; per decision, its answers and right ones; and the wrong picks.
     * Counts only: the route keeps what five students or more stand behind.
     */
    async report({ courseId, groupIds }: { courseId: string; groupIds: string[] | null }) {
      const { students } = studentsOf(db, orgId, courseId, groupIds);
      const counted = and(
        eq(pr.orgId, orgId),
        inArray(pr.notebookId, courseNotebooks(courseId)),
        inArray(pr.userId, students),
      );
      const [perEmbed, perTopic, perDecision, wrong] = await Promise.all([
        db
          .select({
            notebookId: pr.notebookId,
            cell: pr.cell,
            notebook: notebooks.title,
            labId: notebooks.labId,
            viz: embeds.viz,
            title: embeds.title,
            students: countDistinct(pr.userId),
            answers: total,
            right,
          })
          .from(pr)
          .innerJoin(notebooks, and(eq(notebooks.id, pr.notebookId), eq(notebooks.orgId, orgId)))
          .leftJoin(
            embeds,
            and(eq(embeds.orgId, orgId), eq(embeds.notebookId, pr.notebookId), eq(embeds.cell, pr.cell)),
          )
          .where(counted)
          .groupBy(pr.notebookId, pr.cell),
        db.selectDistinct({ notebookId: pr.notebookId, cell: pr.cell, topic: pr.topic }).from(pr).where(counted),
        db
          .select({
            notebookId: pr.notebookId,
            cell: pr.cell,
            decision: pr.decision,
            prompt: sql<string>`max(${pr.prompt})`,
            answer: sql<string>`max(${pr.answer})`,
            students: total,
            right,
          })
          .from(pr)
          .where(counted)
          .groupBy(pr.notebookId, pr.cell, pr.decision),
        db
          .select({ notebookId: pr.notebookId, cell: pr.cell, decision: pr.decision, pick: pr.pick, students: total })
          .from(pr)
          .where(and(counted, eq(pr.correct, false)))
          .groupBy(pr.notebookId, pr.cell, pr.decision, pr.pick),
      ]);
      return { perEmbed, perTopic, perDecision, wrong };
    },

    /**
     * The pilot report's learning numbers (#153) from `from` to `to` (YYYY-MM-DD, both included), for
     * the students of `groupIds` (all the course's groups when null): totals, per topic and per week,
     * the first day against the later days of students who answered on two days or more, and the
     * trace-table rows checked. Counts only.
     */
    async pilot({
      courseId,
      groupIds,
      from,
      to,
    }: {
      courseId: string;
      groupIds: string[] | null;
      from: string;
      to: string;
    }) {
      const { students } = studentsOf(db, orgId, courseId, groupIds);
      const counted = and(
        eq(pr.orgId, orgId),
        inArray(pr.notebookId, courseNotebooks(courseId)),
        inArray(pr.userId, students),
        gte(pr.day, from),
        lte(pr.day, to),
      );
      const week = sql<string>`date(${pr.day}, '-' || ((cast(strftime('%w', ${pr.day}) as integer) + 6) % 7) || ' days')`;
      const firsts = db
        .select({ userId: pr.userId, first: sql<string>`min(${pr.day})`.as('first') })
        .from(pr)
        .where(counted)
        .groupBy(pr.userId)
        .having(sql`count(distinct ${pr.day}) >= 2`)
        .as('firsts');
      const firstDay = sql<number>`${pr.day} = ${firsts.first}`;
      const [totals, perTopic, perWeek, growth, trace] = await db.batch([
        db
          .select({ students: countDistinct(pr.userId), answers: total, right })
          .from(pr)
          .where(counted),
        db
          .select({ topic: pr.topic, students: countDistinct(pr.userId), answers: total, right })
          .from(pr)
          .where(counted)
          .groupBy(pr.topic),
        db.select({ week, answers: total, right }).from(pr).where(counted).groupBy(week),
        db
          .select({ first: firstDay, students: countDistinct(pr.userId), answers: total, right })
          .from(pr)
          .innerJoin(firsts, eq(firsts.userId, pr.userId))
          .where(counted)
          .groupBy(firstDay),
        db
          .select({ students: countDistinct(pr.userId), total })
          .from(pr)
          .where(and(counted, like(pr.topic, 'trace-%'))),
      ]);
      return { totals: totals[0], perTopic, perWeek, growth, trace: trace[0] };
    },
  };
}

/** Learning activity (#18): recorded once per student, lab, kind and day; read only as counts. */
function tenantActivity(db: Db, orgId: string) {
  return {
    /** Records that the student did this today; doing it again the same day changes nothing. */
    async record(row: { labId: string; userId: string; kind: ActivityKind; day: string }) {
      await rethrowMissingParent(
        db
          .insert(labActivity)
          .values({ ...row, id: uuidv7(), orgId })
          .onConflictDoNothing(),
      );
    },

    /**
     * Counts for a course: distinct students per week and kind since `since`, and per lab and kind
     * overall. Only students of `groupIds` count (all the course's groups when null), so staff
     * activity never shows and a pedagog of one group sees only that group.
     */
    async report({ courseId, groupIds, since }: { courseId: string; groupIds: string[] | null; since: string }) {
      const courseLabs = db
        .select({ id: labs.id })
        .from(labs)
        .where(and(eq(labs.orgId, orgId), eq(labs.courseId, courseId)));
      const { inGroups, students } = studentsOf(db, orgId, courseId, groupIds);
      const counted = and(
        eq(labActivity.orgId, orgId),
        inArray(labActivity.labId, courseLabs),
        inArray(labActivity.userId, students),
      );
      // The Monday of the row's week.
      const week = sql<string>`date(${labActivity.day}, '-' || ((cast(strftime('%w', ${labActivity.day}) as integer) + 6) % 7) || ' days')`;
      const recent = gte(labActivity.day, since);

      const [enrolled, perWeekKind, perWeek, perLab] = await Promise.all([
        db
          .select({ n: countDistinct(memberships.userId) })
          .from(memberships)
          .where(and(eq(memberships.orgId, orgId), eq(memberships.role, 'student'), inGroups)),
        db
          .select({ week, kind: labActivity.kind, students: countDistinct(labActivity.userId) })
          .from(labActivity)
          .where(and(counted, recent))
          .groupBy(week, labActivity.kind),
        db
          .select({ week, students: countDistinct(labActivity.userId) })
          .from(labActivity)
          .where(and(counted, recent))
          .groupBy(week),
        db
          .select({ labId: labActivity.labId, kind: labActivity.kind, students: countDistinct(labActivity.userId) })
          .from(labActivity)
          .where(counted)
          .groupBy(labActivity.labId, labActivity.kind),
      ]);
      return { students: enrolled[0]?.n ?? 0, perWeekKind, perWeek, perLab };
    },

    /**
     * The pilot report's counts (#101) from `from` to `to` (the institution's YYYY-MM-DD days, both
     * included; `start` and `end` are their first and last moments, for timestamps), for the
     * students of `groupIds` (all the course's groups when null), in one batch.
     */
    async pilot({
      courseId,
      groupIds,
      from,
      to,
      start,
      end,
    }: {
      courseId: string;
      groupIds: string[] | null;
      from: string;
      to: string;
      start: Date;
      end: Date;
    }) {
      const courseLabs = db
        .select({ id: labs.id })
        .from(labs)
        .where(and(eq(labs.orgId, orgId), eq(labs.courseId, courseId)));
      const courseNotebooks = db
        .select({ id: notebooks.id })
        .from(notebooks)
        .where(and(eq(notebooks.orgId, orgId), inArray(notebooks.labId, courseLabs)));
      const { inGroups, students } = studentsOf(db, orgId, courseId, groupIds);
      const inPeriod = and(gte(labActivity.day, from), lte(labActivity.day, to));
      const counted = and(
        eq(labActivity.orgId, orgId),
        inArray(labActivity.labId, courseLabs),
        inArray(labActivity.userId, students),
        inPeriod,
      );
      const week = sql<string>`date(${labActivity.day}, '-' || ((cast(strftime('%w', ${labActivity.day}) as integer) + 6) % 7) || ' days')`;
      // AI use is kept per UTC day: the UTC days the period touches.
      const [usageFrom, usageTo] = [start, end].map((d) => d.toISOString().slice(0, 10)) as [string, string];
      const [enrolled, perWeek, active, perKind, solved, handed, asked, requested] = await db.batch([
        db
          .select({ n: countDistinct(memberships.userId) })
          .from(memberships)
          .where(and(eq(memberships.orgId, orgId), eq(memberships.role, 'student'), inGroups)),
        db
          .select({ week, students: countDistinct(labActivity.userId) })
          .from(labActivity)
          .where(counted)
          .groupBy(week),
        db
          .select({ n: countDistinct(labActivity.userId) })
          .from(labActivity)
          .where(counted),
        db
          .select({ kind: labActivity.kind, students: countDistinct(labActivity.userId), total: sql<number>`count(*)` })
          .from(labActivity)
          .where(counted)
          .groupBy(labActivity.kind),
        db
          .select({ students: countDistinct(exerciseCompletions.userId), total: sql<number>`count(*)` })
          .from(exerciseCompletions)
          .where(
            and(
              eq(exerciseCompletions.orgId, orgId),
              inArray(exerciseCompletions.notebookId, courseNotebooks),
              inArray(exerciseCompletions.userId, students),
              gte(exerciseCompletions.completedAt, start),
              lte(exerciseCompletions.completedAt, end),
            ),
          ),
        db
          .select({ students: countDistinct(submissions.userId), total: sql<number>`count(*)` })
          .from(submissions)
          .where(
            and(
              eq(submissions.orgId, orgId),
              inArray(submissions.notebookId, courseNotebooks),
              inArray(submissions.userId, students),
              gte(submissions.submittedAt, start),
              lte(submissions.submittedAt, end),
            ),
          ),
        db
          .select({ students: countDistinct(aiQuestions.userId), total: sql<number>`count(*)` })
          .from(aiQuestions)
          .where(
            and(
              eq(aiQuestions.orgId, orgId),
              eq(aiQuestions.courseId, courseId),
              inArray(aiQuestions.userId, students),
              gte(aiQuestions.createdAt, start),
              lte(aiQuestions.createdAt, end),
            ),
          ),
        db
          .select({ total: sql<number>`coalesce(sum(${aiUsage.requests}), 0)` })
          .from(aiUsage)
          .where(
            and(
              eq(aiUsage.orgId, orgId),
              eq(aiUsage.courseId, courseId),
              inArray(aiUsage.userId, students),
              gte(aiUsage.day, usageFrom),
              lte(aiUsage.day, usageTo),
            ),
          ),
      ]);
      return {
        students: enrolled[0]?.n ?? 0,
        perWeek,
        active: active[0]?.n ?? 0,
        perKind,
        solved: solved[0],
        handed: handed[0],
        asked: asked[0],
        aiRequests: Number(requested[0]?.total ?? 0),
      };
    },
  };
}

/** A notebook's exercises and their completions (#51); completions are read back only as counts. */
function tenantExercises(db: Db, orgId: string) {
  const ofNotebook = (notebookId: string) => and(eq(exercises.orgId, orgId), eq(exercises.notebookId, notebookId));
  return {
    of(notebookId: string) {
      return db
        .select({ cell: exercises.cell, title: exercises.title, test: exercises.test, ai: exercises.aiMode })
        .from(exercises)
        .where(ofNotebook(notebookId))
        .orderBy(asc(exercises.cell));
    },

    /** Replaces all exercises of the notebook at once: at most 100, 11 statements. */
    async set(notebookId: string, list: { cell: number; title: string; test: string | null; ai?: AiMode }[]) {
      const rows = list.map(({ ai, ...exercise }) => ({
        ...exercise,
        aiMode: ai ?? 'hints',
        id: uuidv7(),
        orgId,
        notebookId,
      }));
      await rethrowMissingParent(
        db.batch([
          db.delete(exercises).where(ofNotebook(notebookId)),
          ...inChunks(rows).map((chunk) => db.insert(exercises).values(chunk)),
        ]),
      );
    },

    /** Records that the user completed it; completing it again changes nothing. */
    async complete(row: { notebookId: string; cell: number; userId: string }) {
      await rethrowMissingParent(
        db
          .insert(exerciseCompletions)
          .values({ ...row, id: uuidv7(), orgId })
          .onConflictDoNothing(),
      );
    },

    async doneBy(notebookId: string, userId: string) {
      const rows = await db
        .select({ cell: exerciseCompletions.cell })
        .from(exerciseCompletions)
        .where(
          and(
            eq(exerciseCompletions.orgId, orgId),
            eq(exerciseCompletions.notebookId, notebookId),
            eq(exerciseCompletions.userId, userId),
          ),
        )
        .orderBy(asc(exerciseCompletions.cell));
      return rows.map((row) => row.cell);
    },

    /**
     * How many students of `groupIds` (all the course's groups when null) completed each of the
     * notebook's current exercises, made in SQL so no student is named.
     */
    async counts({
      notebookId,
      courseId,
      groupIds,
    }: {
      notebookId: string;
      courseId: string;
      groupIds: string[] | null;
    }) {
      const { inGroups, students } = studentsOf(db, orgId, courseId, groupIds);
      const [enrolled, rows] = await Promise.all([
        db
          .select({ n: countDistinct(memberships.userId) })
          .from(memberships)
          .where(and(eq(memberships.orgId, orgId), eq(memberships.role, 'student'), inGroups)),
        db
          .select({ cell: exerciseCompletions.cell, students: countDistinct(exerciseCompletions.userId) })
          .from(exerciseCompletions)
          .where(
            and(
              eq(exerciseCompletions.orgId, orgId),
              eq(exerciseCompletions.notebookId, notebookId),
              inArray(exerciseCompletions.userId, students),
              inArray(
                exerciseCompletions.cell,
                db.select({ cell: exercises.cell }).from(exercises).where(ofNotebook(notebookId)),
              ),
            ),
          )
          .groupBy(exerciseCompletions.cell)
          .orderBy(asc(exerciseCompletions.cell)),
      ]);
      return { students: enrolled[0]?.n ?? 0, counts: rows };
    },
  };
}

/**
 * Notebooks opened for submission per group, and the work handed in (#52). A submission is read by
 * its author, or by staff for the students of groups they review.
 */
function tenantSubmissions(db: Db, orgId: string) {
  const summary = {
    userId: submissions.userId,
    solved: submissions.solved,
    attempts: submissions.attempts,
    submittedAt: submissions.submittedAt,
    code: submissions.code,
  };
  return {
    assignmentsOf(notebookId: string) {
      return db
        .select({ groupId: assignments.groupId, dueAt: assignments.dueAt })
        .from(assignments)
        .where(and(eq(assignments.orgId, orgId), eq(assignments.notebookId, notebookId)));
    },

    /** Opens the notebook to the group until `dueAt`, or moves the deadline. */
    async open(notebookId: string, groupId: string, dueAt: Date) {
      await rethrowMissingParent(
        db
          .insert(assignments)
          .values({ id: uuidv7(), orgId, notebookId, groupId, dueAt })
          .onConflictDoUpdate({
            target: [assignments.orgId, assignments.notebookId, assignments.groupId],
            set: { dueAt },
          }),
      );
    },

    async close(notebookId: string, groupId: string) {
      await db
        .delete(assignments)
        .where(
          and(eq(assignments.orgId, orgId), eq(assignments.notebookId, notebookId), eq(assignments.groupId, groupId)),
        );
    },

    /** Hands in the user's work, replacing what they handed in before. */
    async submit(row: {
      notebookId: string;
      userId: string;
      code: { cell: number; code: string }[];
      solved: number[];
      traces?: { cell: number; rows: Record<string, string>[] }[];
    }) {
      const submittedAt = new Date();
      const traces = row.traces ?? [];
      await rethrowMissingParent(
        db
          .insert(submissions)
          .values({ ...row, traces, id: uuidv7(), orgId, attempts: 1, submittedAt })
          .onConflictDoUpdate({
            target: [submissions.orgId, submissions.notebookId, submissions.userId],
            set: {
              code: row.code,
              solved: row.solved,
              traces,
              submittedAt,
              attempts: sql`${submissions.attempts} + 1`,
            },
          }),
      );
    },

    /** The trace tables' rows a student handed in (#168), for the server to grade. */
    async tracesOf(notebookId: string, userId: string) {
      const [row] = await db
        .select({ traces: submissions.traces })
        .from(submissions)
        .where(
          and(eq(submissions.orgId, orgId), eq(submissions.notebookId, notebookId), eq(submissions.userId, userId)),
        );
      return row?.traces ?? [];
    },

    async of(notebookId: string, userId: string) {
      const [row] = await db
        .select(summary)
        .from(submissions)
        .where(
          and(eq(submissions.orgId, orgId), eq(submissions.notebookId, notebookId), eq(submissions.userId, userId)),
        );
      return row;
    },

    /** The group's students, each with what they handed in, if anything. */
    ofGroup(notebookId: string, groupId: string) {
      return db
        .select({
          id: users.id,
          fullName: users.fullName,
          username: users.username,
          solved: submissions.solved,
          attempts: submissions.attempts,
          submittedAt: submissions.submittedAt,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .leftJoin(
          submissions,
          and(
            eq(submissions.orgId, orgId),
            eq(submissions.notebookId, notebookId),
            eq(submissions.userId, memberships.userId),
          ),
        )
        .where(and(eq(memberships.orgId, orgId), eq(memberships.groupId, groupId), eq(memberships.role, 'student')))
        .orderBy(asc(users.fullName));
    },

    /** Whether the user is a student of one of these groups. */
    async isStudentOf(userId: string, groupIds: string[]) {
      if (!groupIds.length) return false;
      const [row] = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.orgId, orgId),
            eq(memberships.userId, userId),
            eq(memberships.role, 'student'),
            inArray(memberships.groupId, groupIds),
          ),
        )
        .limit(1);
      return row !== undefined;
    },
  };
}

/** Points and hidden tests per exercise, and the grades of re-run submissions (#53). Staff only. */
function tenantGrading(db: Db, orgId: string) {
  const ofNotebook = (notebookId: string) =>
    and(eq(exerciseGrading.orgId, orgId), eq(exerciseGrading.notebookId, notebookId));
  const gradeOf = (notebookId: string, userId: string) =>
    and(eq(grades.orgId, orgId), eq(grades.notebookId, notebookId), eq(grades.userId, userId));
  return {
    setupOf(notebookId: string) {
      return db
        .select({ cell: exerciseGrading.cell, points: exerciseGrading.points, hiddenTest: exerciseGrading.hiddenTest })
        .from(exerciseGrading)
        .where(ofNotebook(notebookId))
        .orderBy(asc(exerciseGrading.cell));
    },

    /** Replaces the notebook's points and hidden tests at once. */
    async setSetup(notebookId: string, list: { cell: number; points: number; hiddenTest: string | null }[]) {
      const rows = list.map((row) => ({ ...row, id: uuidv7(), orgId, notebookId }));
      await rethrowMissingParent(
        db.batch([
          db.delete(exerciseGrading).where(ofNotebook(notebookId)),
          ...inChunks(rows).map((chunk) => db.insert(exerciseGrading).values(chunk)),
        ]),
      );
    },

    /** Stores a re-run's result; the pedagog's adjustment and the release stay. */
    async record(row: {
      notebookId: string;
      userId: string;
      autoScore: number;
      maxScore: number;
      results: { cell: number; status: string }[];
      traces?: { cell: number; rows: number; right: number; points: number; score: number }[];
    }) {
      const gradedAt = new Date();
      const traces = row.traces ?? [];
      await rethrowMissingParent(
        db
          .insert(grades)
          .values({ ...row, traces, id: uuidv7(), orgId, gradedAt })
          .onConflictDoUpdate({
            target: [grades.orgId, grades.notebookId, grades.userId],
            set: { autoScore: row.autoScore, maxScore: row.maxScore, results: row.results, traces, gradedAt },
          }),
      );
    },

    /** The pedagog's score and feedback for a graded submission; false when it has no grade yet. */
    async review(notebookId: string, userId: string, change: { score: number | null; feedback: string | null }) {
      const updated = await db
        .update(grades)
        .set(change)
        .where(gradeOf(notebookId, userId))
        .returning({ id: grades.id });
      return updated.length > 0;
    },

    /** Shows these students their grades. */
    async release(notebookId: string, userIds: string[]) {
      if (!userIds.length) return;
      await db
        .update(grades)
        .set({ releasedAt: new Date() })
        .where(and(eq(grades.orgId, orgId), eq(grades.notebookId, notebookId), inArray(grades.userId, userIds)));
    },

    ofNotebook(notebookId: string, userIds: string[]) {
      if (!userIds.length) return Promise.resolve([]);
      return db
        .select()
        .from(grades)
        .where(and(eq(grades.orgId, orgId), eq(grades.notebookId, notebookId), inArray(grades.userId, userIds)));
    },

    async of(notebookId: string, userId: string) {
      const [row] = await db.select().from(grades).where(gradeOf(notebookId, userId));
      return row;
    },

    /** The students of these groups and their released grades in the course (#114), in one batch. */
    async releasedInCourse(courseId: string, groupIds: string[]) {
      if (!groupIds.length) return { students: [], released: [] };
      const ofGroups = and(
        eq(memberships.orgId, orgId),
        inArray(memberships.groupId, groupIds),
        eq(memberships.role, 'student'),
      );
      const [students, released] = await db.batch([
        db
          .select({ id: users.id, username: users.username, fullName: users.fullName, groupId: memberships.groupId })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(ofGroups)
          .orderBy(asc(users.fullName)),
        db
          .select({
            userId: grades.userId,
            notebookId: grades.notebookId,
            score: sql<number>`coalesce(${grades.score}, ${grades.autoScore})`,
            maxScore: grades.maxScore,
          })
          .from(grades)
          .innerJoin(notebooks, and(eq(notebooks.id, grades.notebookId), eq(notebooks.orgId, orgId)))
          .innerJoin(labs, and(eq(labs.id, notebooks.labId), eq(labs.orgId, orgId)))
          .where(
            and(
              eq(grades.orgId, orgId),
              eq(labs.courseId, courseId),
              isNotNull(grades.releasedAt),
              inArray(grades.userId, db.select({ id: memberships.userId }).from(memberships).where(ofGroups)),
            ),
          ),
      ]);
      return { students, released };
    },
  };
}

/** Teaching staff of a course (#64): pedagogs and assistants, for the whole course or one group. */
function tenantStaff(db: Db, orgId: string) {
  const ofCourse = (courseId: string) =>
    or(
      eq(memberships.courseId, courseId),
      inArray(
        memberships.groupId,
        db
          .select({ id: groups.id })
          .from(groups)
          .where(and(eq(groups.orgId, orgId), eq(groups.courseId, courseId))),
      ),
    );
  return {
    list(courseId: string) {
      return db
        .select({
          id: memberships.id,
          userId: users.id,
          fullName: users.fullName,
          username: users.username,
          role: memberships.role,
          groupId: memberships.groupId,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.orgId, orgId), ofCourse(courseId), ne(memberships.role, 'student')))
        .orderBy(asc(users.fullName));
    },

    /** A member of this organization by username; another organization's accounts are not found. */
    async findMember(username: string) {
      const [row] = await db
        .selectDistinct({ id: users.id })
        .from(users)
        .innerJoin(memberships, eq(memberships.userId, users.id))
        .where(and(eq(memberships.orgId, orgId), eq(users.username, username.toLowerCase())))
        .limit(1);
      return row?.id;
    },

    /** A new account with only this role in the course or group; its username numbered if taken. */
    async createInto(
      scope: { courseId: string } | { groupId: string },
      role: string,
      account: { fullName: string; username: string; passwordHash: string },
    ) {
      await assertRole(db, role);
      const [user] = await freeUsernames(db, [account]);
      if (!user) throw new Error('No account to create');
      await db.batch([
        db.insert(users).values(user),
        db.insert(memberships).values({ id: uuidv7(), orgId, userId: user.id, role, ...scope }),
      ]);
      return { id: user.id, fullName: user.fullName, username: user.username };
    },

    /** Whether the user already has a role in exactly this course or group. */
    async hasRoleIn(userId: string, scope: { courseId: string } | { groupId: string }) {
      const where =
        'courseId' in scope ? eq(memberships.courseId, scope.courseId) : eq(memberships.groupId, scope.groupId);
      const [row] = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId), where))
        .limit(1);
      return row !== undefined;
    },

    /** The course-wide pedagogs, so the last one is never removed. */
    async pedagogs(courseId: string) {
      const rows = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.orgId, orgId), eq(memberships.courseId, courseId), eq(memberships.role, 'pedagog')));
      return rows.map((row) => row.id);
    },
  };
}

/** Live Lab sessions (#65): at most one running per lab. */
function tenantLive(db: Db, orgId: string) {
  const fields = {
    id: liveSessions.id,
    labId: liveSessions.labId,
    hostId: liveSessions.hostId,
    hostName: users.fullName,
    startedAt: liveSessions.startedAt,
  };
  return {
    async running(labId: string) {
      const [row] = await db
        .select(fields)
        .from(liveSessions)
        .innerJoin(users, eq(users.id, liveSessions.hostId))
        .where(and(eq(liveSessions.orgId, orgId), eq(liveSessions.labId, labId), isNull(liveSessions.endedAt)));
      return row;
    },

    /** Starts one, or gives the one already running. */
    async start(labId: string, hostId: string) {
      await rethrowMissingParent(
        db
          .insert(liveSessions)
          .values({ id: uuidv7(), orgId, labId, hostId, startedAt: new Date() })
          .onConflictDoNothing(),
      );
      return this.running(labId);
    },

    async end(id: string) {
      await db
        .update(liveSessions)
        .set({ endedAt: new Date() })
        .where(and(eq(liveSessions.orgId, orgId), eq(liveSessions.id, id), isNull(liveSessions.endedAt)));
    },
  };
}

function tenantAi(db: Db, orgId: string) {
  return {
    /** The user's requests today, across the organization's courses, and the organization's neurons. */
    async today(userId: string, day: string) {
      const [mine] = await db
        .select({ requests: sql<number>`coalesce(sum(${aiUsage.requests}), 0)` })
        .from(aiUsage)
        .where(and(eq(aiUsage.orgId, orgId), eq(aiUsage.userId, userId), eq(aiUsage.day, day)));
      const [all] = await db
        .select({ neurons: sql<number>`coalesce(sum(${aiUsage.neurons}), 0)` })
        .from(aiUsage)
        .where(and(eq(aiUsage.orgId, orgId), eq(aiUsage.day, day)));
      return { requests: mine?.requests ?? 0, orgNeurons: all?.neurons ?? 0 };
    },

    /** Keeps a student's "Explain my error" with its answer, for the course's staff (#86). */
    async ask(values: {
      courseId: string;
      notebookId: string;
      userId: string;
      cell: number;
      code: string;
      error: string;
      answer: string;
    }) {
      await rethrowMissingParent(db.insert(aiQuestions).values({ ...values, id: uuidv7(), orgId }));
    },

    /** The course's latest questions, newest first; groupIds null means all of its students. */
    async questions(courseId: string, groupIds: string[] | null, limit = 100): Promise<AiQuestion[]> {
      const rows = await db
        .select({
          id: aiQuestions.id,
          name: users.fullName,
          lab: labs.title,
          notebook: notebooks.title,
          cell: aiQuestions.cell,
          code: aiQuestions.code,
          error: aiQuestions.error,
          answer: aiQuestions.answer,
          at: aiQuestions.createdAt,
        })
        .from(aiQuestions)
        .innerJoin(users, eq(users.id, aiQuestions.userId))
        .innerJoin(notebooks, and(eq(notebooks.id, aiQuestions.notebookId), eq(notebooks.orgId, orgId)))
        .innerJoin(labs, and(eq(labs.id, notebooks.labId), eq(labs.orgId, orgId)))
        .where(
          and(
            eq(aiQuestions.orgId, orgId),
            eq(aiQuestions.courseId, courseId),
            inArray(aiQuestions.userId, studentsOf(db, orgId, courseId, groupIds).students),
          ),
        )
        .orderBy(desc(aiQuestions.createdAt))
        .limit(limit);
      return rows.map(({ at, ...row }) => ({ ...row, at: at.toISOString() }));
    },

    /** Adds to the day's counts (negative to give back what a failed call reserved). */
    async record(values: { courseId: string; userId: string; day: string; requests: number; neurons: number }) {
      await rethrowMissingParent(
        db
          .insert(aiUsage)
          .values({ ...values, orgId })
          .onConflictDoUpdate({
            target: [aiUsage.orgId, aiUsage.courseId, aiUsage.userId, aiUsage.day],
            set: {
              requests: sql`max(0, ${aiUsage.requests} + ${values.requests})`,
              neurons: sql`max(0, ${aiUsage.neurons} + ${values.neurons})`,
            },
          }),
      );
    },
  };
}

/**
 * One user's progress in a course (#99), in one batch whatever the number of notebooks: their
 * solved exercises (of the ones still set), the labs they opened, their groups' deadlines, their
 * submissions and their released grades.
 */
function tenantProgress(db: Db, orgId: string) {
  return {
    async of(courseId: string, userId: string, groupIds: string[]) {
      const ofCourse = db
        .select({ id: notebooks.id })
        .from(notebooks)
        .innerJoin(labs, and(eq(labs.id, notebooks.labId), eq(labs.orgId, orgId)))
        .where(and(eq(notebooks.orgId, orgId), eq(labs.courseId, courseId)));
      const [set, solved, opened, due, handed, graded] = await db.batch([
        db
          .select({ notebookId: exercises.notebookId, n: sql<number>`count(*)` })
          .from(exercises)
          .where(and(eq(exercises.orgId, orgId), inArray(exercises.notebookId, ofCourse)))
          .groupBy(exercises.notebookId),
        db
          .select({ notebookId: exerciseCompletions.notebookId, n: sql<number>`count(*)` })
          .from(exerciseCompletions)
          .innerJoin(
            exercises,
            and(
              eq(exercises.orgId, orgId),
              eq(exercises.notebookId, exerciseCompletions.notebookId),
              eq(exercises.cell, exerciseCompletions.cell),
            ),
          )
          .where(
            and(
              eq(exerciseCompletions.orgId, orgId),
              eq(exerciseCompletions.userId, userId),
              inArray(exerciseCompletions.notebookId, ofCourse),
            ),
          )
          .groupBy(exerciseCompletions.notebookId),
        db
          .selectDistinct({ labId: labActivity.labId })
          .from(labActivity)
          .innerJoin(labs, and(eq(labs.id, labActivity.labId), eq(labs.orgId, orgId)))
          .where(
            and(
              eq(labActivity.orgId, orgId),
              eq(labActivity.userId, userId),
              eq(labActivity.kind, 'view'),
              eq(labs.courseId, courseId),
            ),
          ),
        db
          .select({ notebookId: assignments.notebookId, dueAt: sql<number>`max(${assignments.dueAt})` })
          .from(assignments)
          .where(
            and(
              eq(assignments.orgId, orgId),
              inArray(assignments.groupId, groupIds.length ? groupIds : ['']),
              inArray(assignments.notebookId, ofCourse),
            ),
          )
          .groupBy(assignments.notebookId),
        db
          .select({ notebookId: submissions.notebookId, submittedAt: submissions.submittedAt })
          .from(submissions)
          .where(
            and(
              eq(submissions.orgId, orgId),
              eq(submissions.userId, userId),
              inArray(submissions.notebookId, ofCourse),
            ),
          ),
        db
          .select({
            notebookId: grades.notebookId,
            autoScore: grades.autoScore,
            maxScore: grades.maxScore,
            score: grades.score,
            feedback: grades.feedback,
          })
          .from(grades)
          .where(
            and(
              eq(grades.orgId, orgId),
              eq(grades.userId, userId),
              isNotNull(grades.releasedAt),
              inArray(grades.notebookId, ofCourse),
            ),
          ),
      ]);
      return { set, solved, opened, due, handed, graded };
    },
  };
}

const iso = (date: Date) => date.toISOString();

/** A user's own data in the organization (#100): to download it, and to ask for it to be deleted. */
function tenantPersonal(db: Db, orgId: string) {
  return {
    async export(userId: string): Promise<Omit<OrganizationData, 'organization'>> {
      const nb = (column: SQLiteColumn) => and(eq(notebooks.id, column), eq(notebooks.orgId, orgId));
      const [member, opened, edits, traced, solved, predicted, handed, graded, asked, used, requests] = await db.batch([
        db
          .select({ role: memberships.role, course: courses.title, group: groups.name, since: memberships.createdAt })
          .from(memberships)
          .leftJoin(courses, and(eq(courses.id, memberships.courseId), eq(courses.orgId, orgId)))
          .leftJoin(groups, and(eq(groups.id, memberships.groupId), eq(groups.orgId, orgId)))
          .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId))),
        db
          .select({ lab: labs.title, kind: labActivity.kind, day: labActivity.day })
          .from(labActivity)
          .innerJoin(labs, and(eq(labs.id, labActivity.labId), eq(labs.orgId, orgId)))
          .where(and(eq(labActivity.orgId, orgId), eq(labActivity.userId, userId)))
          .orderBy(asc(labActivity.day)),
        db
          .select({
            notebook: notebooks.title,
            cell: codeEdits.cell,
            code: codeEdits.code,
            savedAt: codeEdits.updatedAt,
          })
          .from(codeEdits)
          .innerJoin(notebooks, nb(codeEdits.notebookId))
          .where(and(eq(codeEdits.orgId, orgId), eq(codeEdits.userId, userId))),
        db
          .select({
            notebook: notebooks.title,
            cell: traceAnswers.cell,
            rows: traceAnswers.rows,
            savedAt: traceAnswers.updatedAt,
          })
          .from(traceAnswers)
          .innerJoin(notebooks, nb(traceAnswers.notebookId))
          .where(and(eq(traceAnswers.orgId, orgId), eq(traceAnswers.userId, userId))),
        db
          .select({ notebook: notebooks.title, cell: exerciseCompletions.cell, at: exerciseCompletions.completedAt })
          .from(exerciseCompletions)
          .innerJoin(notebooks, nb(exerciseCompletions.notebookId))
          .where(and(eq(exerciseCompletions.orgId, orgId), eq(exerciseCompletions.userId, userId))),
        db
          .select({
            notebook: notebooks.title,
            cell: predictionResults.cell,
            topic: predictionResults.topic,
            prompt: predictionResults.prompt,
            pick: predictionResults.pick,
            correct: predictionResults.correct,
            day: predictionResults.day,
          })
          .from(predictionResults)
          .innerJoin(notebooks, nb(predictionResults.notebookId))
          .where(and(eq(predictionResults.orgId, orgId), eq(predictionResults.userId, userId)))
          .orderBy(asc(predictionResults.day)),
        db
          .select({
            notebook: notebooks.title,
            code: submissions.code,
            solved: submissions.solved,
            attempts: submissions.attempts,
            at: submissions.submittedAt,
          })
          .from(submissions)
          .innerJoin(notebooks, nb(submissions.notebookId))
          .where(and(eq(submissions.orgId, orgId), eq(submissions.userId, userId))),
        db
          .select({
            notebook: notebooks.title,
            autoScore: grades.autoScore,
            score: grades.score,
            maxScore: grades.maxScore,
            feedback: grades.feedback,
            releasedAt: grades.releasedAt,
          })
          .from(grades)
          .innerJoin(notebooks, nb(grades.notebookId))
          .where(and(eq(grades.orgId, orgId), eq(grades.userId, userId), isNotNull(grades.releasedAt))),
        db
          .select({
            notebook: notebooks.title,
            cell: aiQuestions.cell,
            code: aiQuestions.code,
            error: aiQuestions.error,
            answer: aiQuestions.answer,
            at: aiQuestions.createdAt,
          })
          .from(aiQuestions)
          .innerJoin(notebooks, nb(aiQuestions.notebookId))
          .where(and(eq(aiQuestions.orgId, orgId), eq(aiQuestions.userId, userId))),
        db
          .select({ course: courses.title, day: aiUsage.day, requests: aiUsage.requests })
          .from(aiUsage)
          .innerJoin(courses, and(eq(courses.id, aiUsage.courseId), eq(courses.orgId, orgId)))
          .where(and(eq(aiUsage.orgId, orgId), eq(aiUsage.userId, userId))),
        db
          .select({
            note: deletionRequests.note,
            at: deletionRequests.createdAt,
            handledAt: deletionRequests.handledAt,
          })
          .from(deletionRequests)
          .where(and(eq(deletionRequests.orgId, orgId), eq(deletionRequests.userId, userId))),
      ]);
      return {
        memberships: member.map((m) => ({ ...m, since: iso(m.since) })),
        labsOpened: opened,
        codeEdits: edits.map((e) => ({ ...e, savedAt: iso(e.savedAt) })),
        traceAnswers: traced.map((t) => ({ ...t, savedAt: iso(t.savedAt) })),
        exercisesSolved: solved.map((s) => ({ ...s, at: iso(s.at) })),
        firstTries: predicted,
        submissions: handed.map((s) => ({ ...s, at: iso(s.at) })),
        grades: graded.map(({ autoScore, score, releasedAt, ...g }) => ({
          ...g,
          score: score ?? autoScore,
          releasedAt: iso(releasedAt as Date),
        })),
        aiQuestions: asked.map((q) => ({ ...q, at: iso(q.at) })),
        aiUse: used,
        deletionRequests: requests.map((r) => ({
          ...r,
          at: iso(r.at),
          handledAt: r.handledAt ? iso(r.handledAt) : null,
        })),
      };
    },

    /** Asks the organization to delete the user's data; asking again while one is open changes nothing. */
    async requestDeletion(userId: string, note: string | null) {
      await db.insert(deletionRequests).values({ id: uuidv7(), orgId, userId, note }).onConflictDoNothing();
    },

    /** The organization's requests: open ones first, then the latest handled. */
    async deletionRequests(): Promise<DeletionRequestView[]> {
      const rows = await db
        .select({
          id: deletionRequests.id,
          name: users.fullName,
          username: users.username,
          note: deletionRequests.note,
          createdAt: deletionRequests.createdAt,
          handledAt: deletionRequests.handledAt,
        })
        .from(deletionRequests)
        .innerJoin(users, eq(users.id, deletionRequests.userId))
        .where(eq(deletionRequests.orgId, orgId))
        .orderBy(sql`${deletionRequests.handledAt} is not null`, desc(deletionRequests.createdAt))
        .limit(200);
      return rows.map((r) => ({
        ...r,
        createdAt: iso(r.createdAt),
        handledAt: r.handledAt ? iso(r.handledAt) : null,
      }));
    },

    /** An open request and who made it; undefined once handled or when it is another's. */
    async openRequest(id: string) {
      const [row] = await db
        .select({ userId: deletionRequests.userId, createdAt: deletionRequests.createdAt })
        .from(deletionRequests)
        .where(and(eq(deletionRequests.orgId, orgId), eq(deletionRequests.id, id), isNull(deletionRequests.handledAt)));
      return row;
    },

    /** The user's released grades here, for the institution's records before it erases them (#115). */
    async releasedGrades(userId: string): Promise<PersonGrade[]> {
      const rows = await db
        .select({
          course: courses.title,
          lab: labs.n,
          notebook: notebooks.title,
          score: sql<number>`coalesce(${grades.score}, ${grades.autoScore})`,
          maxScore: grades.maxScore,
          releasedAt: grades.releasedAt,
        })
        .from(grades)
        .innerJoin(notebooks, and(eq(notebooks.id, grades.notebookId), eq(notebooks.orgId, orgId)))
        .innerJoin(labs, and(eq(labs.id, notebooks.labId), eq(labs.orgId, orgId)))
        .innerJoin(courses, and(eq(courses.id, labs.courseId), eq(courses.orgId, orgId)))
        .where(and(eq(grades.orgId, orgId), eq(grades.userId, userId), isNotNull(grades.releasedAt)))
        .orderBy(asc(courses.title), asc(labs.n), asc(notebooks.title));
      return rows.map((r) => ({ ...r, score: Number(r.score), releasedAt: iso(r.releasedAt as Date) }));
    },

    /**
     * Erases everything of the user in this organization (#115) and records that it was done, in one
     * atomic batch. The institution's content stays, also what the user made. The account goes too
     * when nothing ties it to another institution: no membership and no grade there.
     */
    async erase(userId: string, requestedAt: Date, by: string) {
      const [elsewhere, gradedElsewhere] = await db.batch([
        db
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.userId, userId), ne(memberships.orgId, orgId)))
          .limit(1),
        db
          .select({ id: grades.id })
          .from(grades)
          .where(and(eq(grades.userId, userId), ne(grades.orgId, orgId)))
          .limit(1),
      ]);
      const accountDeleted = !elsewhere.length && !gradedElsewhere.length;
      await db.batch([
        db.delete(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId))),
        db.delete(labActivity).where(and(eq(labActivity.orgId, orgId), eq(labActivity.userId, userId))),
        db.delete(codeEdits).where(and(eq(codeEdits.orgId, orgId), eq(codeEdits.userId, userId))),
        db.delete(traceAnswers).where(and(eq(traceAnswers.orgId, orgId), eq(traceAnswers.userId, userId))),
        db
          .delete(exerciseCompletions)
          .where(and(eq(exerciseCompletions.orgId, orgId), eq(exerciseCompletions.userId, userId))),
        db
          .delete(predictionResults)
          .where(and(eq(predictionResults.orgId, orgId), eq(predictionResults.userId, userId))),
        db.delete(submissions).where(and(eq(submissions.orgId, orgId), eq(submissions.userId, userId))),
        db.delete(grades).where(and(eq(grades.orgId, orgId), eq(grades.userId, userId))),
        db.delete(liveSessions).where(and(eq(liveSessions.orgId, orgId), eq(liveSessions.hostId, userId))),
        db.delete(aiUsage).where(and(eq(aiUsage.orgId, orgId), eq(aiUsage.userId, userId))),
        db.delete(aiQuestions).where(and(eq(aiQuestions.orgId, orgId), eq(aiQuestions.userId, userId))),
        db
          .delete(surveyRespondents)
          .where(and(eq(surveyRespondents.orgId, orgId), eq(surveyRespondents.userId, userId))),
        db.delete(deletionRequests).where(and(eq(deletionRequests.orgId, orgId), eq(deletionRequests.userId, userId))),
        // What they did as staff stays, without their name.
        db
          .update(deletionRequests)
          .set({ handledBy: null })
          .where(and(eq(deletionRequests.orgId, orgId), eq(deletionRequests.handledBy, userId))),
        db
          .update(courseTemplates)
          .set({ ownerUserId: null })
          .where(and(eq(courseTemplates.orgId, orgId), eq(courseTemplates.ownerUserId, userId))),
        db
          .update(erasures)
          .set({ erasedBy: null })
          .where(and(eq(erasures.orgId, orgId), eq(erasures.erasedBy, userId))),
        db.insert(erasures).values({ id: uuidv7(), orgId, requestedAt, erasedBy: by, accountDeleted }),
        ...(accountDeleted ? [db.delete(users).where(eq(users.id, userId))] : []),
      ]);
      return { accountDeleted };
    },

    /** The organization's erasures, latest first: when asked, when done and by whom. */
    async erasures(): Promise<ErasureView[]> {
      const rows = await db
        .select({
          id: erasures.id,
          requestedAt: erasures.requestedAt,
          erasedAt: erasures.erasedAt,
          by: users.fullName,
          accountDeleted: erasures.accountDeleted,
        })
        .from(erasures)
        .leftJoin(users, eq(users.id, erasures.erasedBy))
        .where(eq(erasures.orgId, orgId))
        .orderBy(desc(erasures.erasedAt))
        .limit(200);
      return rows.map((r) => ({ ...r, requestedAt: iso(r.requestedAt), erasedAt: iso(r.erasedAt) }));
    },

    async handleDeletion(id: string, by: string) {
      const done = await db
        .update(deletionRequests)
        .set({ handledAt: new Date(), handledBy: by })
        .where(and(eq(deletionRequests.orgId, orgId), eq(deletionRequests.id, id), isNull(deletionRequests.handledAt)))
        .returning({ id: deletionRequests.id });
      return done.length > 0;
    },
  };
}

/** Rows per export page, unless the part's rows are large. */
const EXPORT_PAGE = 500;

type Exportable = { table: SQLiteTable; orgId: SQLiteColumn; id?: SQLiteColumn; omit?: string[]; limit?: number };

/** Each part of an institution's export (#117) but people: its table, key and what it leaves out. */
const EXPORTABLE: Record<Exclude<ExportPart, 'people'>, Exportable> = {
  memberships: { table: memberships, orgId: memberships.orgId, id: memberships.id },
  courseTemplates: { table: courseTemplates, orgId: courseTemplates.orgId, id: courseTemplates.id },
  courses: { table: courses, orgId: courses.orgId, id: courses.id },
  // A join code works as an invitation: not something to carry around in a file.
  groups: { table: groups, orgId: groups.orgId, id: groups.id, omit: ['joinCode'] },
  labs: { table: labs, orgId: labs.orgId, id: labs.id },
  labAccess: { table: labAccess, orgId: labAccess.orgId, id: labAccess.id },
  notebooks: { table: notebooks, orgId: notebooks.orgId, id: notebooks.id },
  embeds: { table: embeds, orgId: embeds.orgId, id: embeds.id },
  exercises: { table: exercises, orgId: exercises.orgId, id: exercises.id },
  exerciseGrading: { table: exerciseGrading, orgId: exerciseGrading.orgId, id: exerciseGrading.id },
  assignments: { table: assignments, orgId: assignments.orgId, id: assignments.id },
  submissions: { table: submissions, orgId: submissions.orgId, id: submissions.id, limit: 100 },
  grades: { table: grades, orgId: grades.orgId, id: grades.id },
  exerciseCompletions: { table: exerciseCompletions, orgId: exerciseCompletions.orgId, id: exerciseCompletions.id },
  predictionResults: { table: predictionResults, orgId: predictionResults.orgId, id: predictionResults.id },
  labActivity: { table: labActivity, orgId: labActivity.orgId, id: labActivity.id },
  aiUsage: { table: aiUsage, orgId: aiUsage.orgId },
  aiQuestions: { table: aiQuestions, orgId: aiQuestions.orgId, id: aiQuestions.id, limit: 200 },
  liveSessions: { table: liveSessions, orgId: liveSessions.orgId, id: liveSessions.id },
  surveys: { table: surveys, orgId: surveys.orgId, id: surveys.id },
  surveyRatings: { table: surveyRatings, orgId: surveyRatings.orgId },
  surveyComments: { table: surveyComments, orgId: surveyComments.orgId, id: surveyComments.id },
  deletionRequests: { table: deletionRequests, orgId: deletionRequests.orgId, id: deletionRequests.id },
  erasures: { table: erasures, orgId: erasures.orgId, id: erasures.id },
};

/**
 * An institution's data for its admin (#117), one page of one part at a time, in key order. Tables
 * without an id page by rowid. People are those with a membership here, without password hashes.
 */
function tenantExport(db: Db, orgId: string) {
  return {
    async page(part: ExportPart, after: string | null, limit = EXPORT_PAGE): Promise<ExportPage> {
      if (part === 'people') {
        const rows = await db
          .select(publicUser)
          .from(users)
          .where(
            and(
              inArray(
                users.id,
                db.select({ id: memberships.userId }).from(memberships).where(eq(memberships.orgId, orgId)),
              ),
              after ? gt(users.id, after) : undefined,
            ),
          )
          .orderBy(asc(users.id))
          .limit(limit);
        return { rows, next: rows.length === limit ? (rows.at(-1)?.id ?? null) : null };
      }
      const spec = EXPORTABLE[part];
      const size = Math.min(limit, spec.limit ?? EXPORT_PAGE);
      const { orgId: _org, ...columns } = getTableColumns(spec.table) as Record<string, SQLiteColumn>;
      for (const name of spec.omit ?? []) delete columns[name];
      const key = spec.id ?? sql<number>`rowid`;
      const past = !after ? undefined : spec.id ? gt(spec.id, after) : gt(sql`rowid`, Number(after));
      const rows = (await db
        .select({ ...columns, _key: key })
        .from(spec.table)
        .where(and(eq(spec.orgId, orgId), past))
        .orderBy(asc(key))
        .limit(size)) as (Record<string, unknown> & { _key: unknown })[];
      const last = rows.at(-1)?._key;
      return {
        rows: rows.map(({ _key, ...row }) => row),
        next: rows.length === size && last !== undefined ? String(last) : null,
      };
    },
  };
}

/** A course's end-of-semester survey (#102): answered anonymously, read only as totals. */
function tenantSurveys(db: Db, orgId: string) {
  return {
    async ofCourse(courseId: string) {
      const [survey] = await db
        .select()
        .from(surveys)
        .where(and(eq(surveys.orgId, orgId), eq(surveys.courseId, courseId)));
      return survey;
    },

    /** Opens the course's survey until `closesAt`, or moves its closing. */
    async open(courseId: string, closesAt: Date) {
      await rethrowMissingParent(
        db
          .insert(surveys)
          .values({ id: uuidv7(), orgId, courseId, closesAt })
          .onConflictDoUpdate({ target: [surveys.orgId, surveys.courseId], set: { closesAt } }),
      );
    },

    async answered(surveyId: string, userId: string) {
      const [row] = await db
        .select({ userId: surveyRespondents.userId })
        .from(surveyRespondents)
        .where(
          and(
            eq(surveyRespondents.orgId, orgId),
            eq(surveyRespondents.surveyId, surveyId),
            eq(surveyRespondents.userId, userId),
          ),
        );
      return row !== undefined;
    },

    /**
     * Records an answer in one transaction: who answered (refused a second time), each rating as a
     * count, and the comment under a random id. False when the user had answered already.
     */
    async answer(surveyId: string, userId: string, ratings: [string, number][], comment: string | null) {
      try {
        await db.batch([
          db.insert(surveyRespondents).values({ orgId, surveyId, userId }),
          ...ratings.map(([question, score]) =>
            db
              .insert(surveyRatings)
              .values({ orgId, surveyId, question, score, n: 1 })
              .onConflictDoUpdate({
                target: [surveyRatings.orgId, surveyRatings.surveyId, surveyRatings.question, surveyRatings.score],
                set: { n: sql`${surveyRatings.n} + 1` },
              }),
          ),
          ...(comment
            ? [db.insert(surveyComments).values({ id: crypto.randomUUID(), orgId, surveyId, text: comment })]
            : []),
        ]);
        return true;
      } catch (error) {
        if (/UNIQUE|PRIMARY KEY/i.test(String((error as Error)?.message ?? error))) return false;
        throw error;
      }
    },

    /** The totals: respondents, the rating counts and the comments (in no meaningful order). */
    async results(surveyId: string) {
      const [respondents, ratings, comments] = await db.batch([
        db
          .select({ n: sql<number>`count(*)` })
          .from(surveyRespondents)
          .where(and(eq(surveyRespondents.orgId, orgId), eq(surveyRespondents.surveyId, surveyId))),
        db
          .select({ question: surveyRatings.question, score: surveyRatings.score, n: surveyRatings.n })
          .from(surveyRatings)
          .where(and(eq(surveyRatings.orgId, orgId), eq(surveyRatings.surveyId, surveyId))),
        db
          .select({ text: surveyComments.text })
          .from(surveyComments)
          .where(and(eq(surveyComments.orgId, orgId), eq(surveyComments.surveyId, surveyId)))
          .orderBy(asc(surveyComments.id)),
      ]);
      return { respondents: Number(respondents[0]?.n ?? 0), ratings, comments: comments.map((c) => c.text) };
    },

    /** Students of the course, for "N of M answered". */
    async students(courseId: string) {
      const { inGroups } = studentsOf(db, orgId, courseId, null);
      const [row] = await db
        .select({ n: countDistinct(memberships.userId) })
        .from(memberships)
        .where(and(eq(memberships.orgId, orgId), eq(memberships.role, 'student'), inGroups));
      return row?.n ?? 0;
    },
  };
}

export function forTenant(db: Db, orgId: string) {
  const members = tenantUsers(db, orgId);
  return {
    orgId,
    users: members,
    memberships: tenantMemberships(db, orgId, members),
    courseTemplates: tenantTable(db, orgId, courseTemplates),
    courses: tenantCourses(db, orgId),
    groups: tenantGroups(db, orgId),
    labs: tenantLabs(db, orgId),
    labAccess: tenantLabAccess(db, orgId),
    students: tenantStudents(db, orgId),
    notebooks: tenantNotebooks(db, orgId),
    activity: tenantActivity(db, orgId),
    codeEdits: tenantCodeEdits(db, orgId),
    traceAnswers: tenantTraceAnswers(db, orgId),
    exercises: tenantExercises(db, orgId),
    predictions: tenantPredictions(db, orgId),
    submissions: tenantSubmissions(db, orgId),
    grading: tenantGrading(db, orgId),
    staff: tenantStaff(db, orgId),
    live: tenantLive(db, orgId),
    ai: tenantAi(db, orgId),
    progress: tenantProgress(db, orgId),
    personal: tenantPersonal(db, orgId),
    surveys: tenantSurveys(db, orgId),
    export: tenantExport(db, orgId),
  };
}

export type TenantDb = ReturnType<typeof forTenant>;

import {
  and,
  asc,
  countDistinct,
  eq,
  gte,
  type InferInsertModel,
  type InferSelectModel,
  inArray,
  isNull,
  like,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { roleExists } from './access';
import { uuidv7 } from './ids';
import type { Db } from './index';
import {
  codeEdits,
  courses,
  courseTemplates,
  embeds,
  fileChunks,
  files,
  groups,
  labAccess,
  labActivity,
  labs,
  memberships,
  notebooks,
  searchSections,
  sessions,
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

type StoredFile = { mime: string; encoding: 'identity' | 'gzip'; size: number; data: Uint8Array };

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
function tenantStudents(db: Db, orgId: string) {
  /** The account rows to insert: each username numbered where it is already taken ("ana.kola2"). */
  async function withFreeUsernames(rows: NewStudent[]) {
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

/** Learning activity (#18): recorded once per student, lab, kind and day; read only as counts. */
function tenantActivity(db: Db, orgId: string) {
  return {
    /** Records that the student did this today; doing it again the same day changes nothing. */
    async record(row: { labId: string; userId: string; kind: 'view' | 'download' | 'visualization'; day: string }) {
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
  };
}

export type TenantDb = ReturnType<typeof forTenant>;

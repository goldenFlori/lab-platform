import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// Conventions for every table:
// - ids are random text (UUIDv7), never sequential;
// - timestamps are Unix seconds, set by the database;
// - every tenant-owned row carries org_id, and points to its parent through (parent_id, org_id),
//   so the database itself refuses a row that links to another organization's data;
// - every unique index on a tenant-owned table includes org_id, so a uniqueness check never
//   compares rows of two organizations (its error would reveal what the other one has).

/** Bytes as Uint8Array (no Node Buffer in the Worker). D1 hands blobs back as ArrayBuffer or number[]. */
const bytes = customType<{ data: Uint8Array; driverData: ArrayBuffer }>({
  dataType: () => 'blob',
  toDriver: (value) => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer,
  fromDriver: (value: unknown) =>
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : Array.isArray(value)
        ? Uint8Array.from(value as number[])
        : new Uint8Array(value as ArrayBufferLike),
});

const createdAt = () => integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`);

const orgId = () =>
  text('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' });

/** A tenant: a university, faculty or school. Every tenant-owned row points here. */
export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: createdAt(),
  /** Branding (#201): an accent colour (#rrggbb) for the light theme, readable by WCAG AA. */
  accent: text('accent'),
  /** Its logo, at most LOGO_BYTES, of an allowed image type; logoVersion changes with it. */
  logo: bytes('logo'),
  logoType: text('logo_type'),
  logoVersion: integer('logo_version'),
  /** Its language (#202), for people who chose none, outside a course that has its own. */
  locale: text('locale', { enum: ['sq', 'en'] }),
  /** Whether its courses may turn AI on (#202); off turns it off in every course. */
  aiAllowed: integer('ai_allowed', { mode: 'boolean' }).notNull().default(true),
});

/**
 * A person, with one account for life. Users belong to no organization directly:
 * organizations reach them only through memberships.
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  /** Lowercase, unique across the platform. */
  username: text('username').notNull().unique(),
  fullName: text('full_name').notNull(),
  email: text('email').unique(),
  /** Set with the login (#8): the algorithm and its parameters are stored with the hash. */
  passwordHash: text('password_hash'),
  status: text('status', { enum: ['active', 'disabled'] })
    .notNull()
    .default('active'),
  /** The interface language the user chose (#19); null follows the course or the default. */
  locale: text('locale', { enum: ['sq', 'en'] }),
  createdAt: createdAt(),
});

/** The coordinator's official program, which yearly courses are created from. */
export const courseTemplates = sqliteTable(
  'course_templates',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    title: text('title').notNull(),
    ownerUserId: text('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [unique('course_templates_id_org_unique').on(t.id, t.orgId)],
);

/** One run of a course in one academic year, such as "SDA 2026/27". */
export const courses = sqliteTable(
  'courses',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    templateId: text('template_id'),
    title: text('title').notNull(),
    /** For example "2026/27". */
    academicYear: text('academic_year').notNull(),
    archivedAt: integer('archived_at', { mode: 'timestamp' }),
    /** The interface language for those who have not chosen one (#19); null is the default. */
    locale: text('locale', { enum: ['sq', 'en'] }),
    /** AI features (#84), off until staff who may configure AI switch them on. */
    aiEnabled: integer('ai_enabled', { mode: 'boolean' }).notNull().default(false),
    /**
     * Where a course copied from another one's share came from (#203): its id, to show the author
     * the copies, and its title and institution as they were then, which stay if the original goes.
     */
    copiedFromCourseId: text('copied_from_course_id'),
    copiedFromTitle: text('copied_from_title'),
    copiedFromInstitution: text('copied_from_institution'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('courses_id_org_unique').on(t.id, t.orgId),
    // No cascade: a template that yearly courses were made from cannot be deleted. (SET NULL would
    // also clear org_id, which is part of the key.)
    foreignKey({
      name: 'courses_template_fk',
      columns: [t.templateId, t.orgId],
      foreignColumns: [courseTemplates.id, courseTemplates.orgId],
    }),
    index('courses_org_idx').on(t.orgId),
    index('courses_template_idx').on(t.templateId, t.orgId),
    index('courses_copied_from_idx').on(t.copiedFromCourseId),
  ],
);

/**
 * A course shared with other institutions (#203): the token in its link, and whether its solutions
 * go with it. One per course; stopping the share deletes the row, so the link stops working. The
 * token is unique across the platform, like a join code: the token alone finds the course. It is
 * long and random, since it is pasted rather than typed.
 */
export const courseShares = sqliteTable(
  'course_shares',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    courseId: text('course_id').notNull(),
    token: text('token').notNull().unique(),
    solutions: integer('solutions', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique('course_shares_id_org_unique').on(t.id, t.orgId),
    uniqueIndex('course_shares_course_unique').on(t.orgId, t.courseId),
    foreignKey({
      name: 'course_shares_course_fk',
      columns: [t.courseId, t.orgId],
      foreignColumns: [courses.id, courses.orgId],
    }).onDelete('cascade'),
  ],
);

/** A class within a course, such as one lab group. */
export const groups = sqliteTable(
  'groups',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    courseId: text('course_id').notNull(),
    name: text('name').notNull(),
    /**
     * What students type (or scan) to join; null while joining is switched off. Unique across the
     * platform, unlike other tenant indexes: the code alone finds the group. Codes are random and
     * made by the server, so a collision reveals nothing anyone could choose to probe.
     */
    joinCode: text('join_code').unique(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('groups_id_org_unique').on(t.id, t.orgId),
    unique('groups_course_name_unique').on(t.orgId, t.courseId, t.name),
    foreignKey({
      name: 'groups_course_fk',
      columns: [t.courseId, t.orgId],
      foreignColumns: [courses.id, courses.orgId],
    }).onDelete('cascade'),
    index('groups_course_idx').on(t.courseId, t.orgId),
  ],
);

/** A lab of a course, in teaching order. */
export const labs = sqliteTable(
  'labs',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    courseId: text('course_id').notNull(),
    /** The lab's number as students know it ("Laboratori 3"). */
    n: integer('n').notNull(),
    title: text('title').notNull(),
    week: integer('week'),
    summary: text('summary'),
    position: integer('position').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('labs_id_org_unique').on(t.id, t.orgId),
    foreignKey({
      name: 'labs_course_fk',
      columns: [t.courseId, t.orgId],
      foreignColumns: [courses.id, courses.orgId],
    }).onDelete('cascade'),
    index('labs_course_idx').on(t.courseId, t.orgId),
  ],
);

/** When a lab is visible, for one group or (without a group) for the whole course. */
export const labAccess = sqliteTable(
  'lab_access',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    labId: text('lab_id').notNull(),
    groupId: text('group_id'),
    visibleFrom: integer('visible_from', { mode: 'timestamp' }),
    visibleUntil: integer('visible_until', { mode: 'timestamp' }),
    /** Before this moment, solutions are visible to staff only. */
    solutionsFrom: integer('solutions_from', { mode: 'timestamp' }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'lab_access_lab_fk',
      columns: [t.labId, t.orgId],
      foreignColumns: [labs.id, labs.orgId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'lab_access_group_fk',
      columns: [t.groupId, t.orgId],
      foreignColumns: [groups.id, groups.orgId],
    }).onDelete('cascade'),
    // One row per lab and group, and one course-wide row (no group) per lab.
    uniqueIndex('lab_access_lab_group_unique').on(t.orgId, t.labId, t.groupId),
    uniqueIndex('lab_access_lab_course_unique').on(t.orgId, t.labId).where(sql`${t.groupId} is null`),
    index('lab_access_group_idx').on(t.groupId, t.orgId),
  ],
);

/**
 * A user's role in an organization, a course or a group: at most one of course_id and group_id
 * is set. Capabilities come from the role (#9).
 */
export const memberships = sqliteTable(
  'memberships',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: text('course_id'),
    groupId: text('group_id'),
    role: text('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'memberships_course_fk',
      columns: [t.courseId, t.orgId],
      foreignColumns: [courses.id, courses.orgId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'memberships_group_fk',
      columns: [t.groupId, t.orgId],
      foreignColumns: [groups.id, groups.orgId],
    }).onDelete('cascade'),
    check('memberships_one_scope', sql`${t.courseId} is null or ${t.groupId} is null`),
    // One role per user and scope.
    uniqueIndex('memberships_org_unique')
      .on(t.userId, t.orgId)
      .where(sql`${t.courseId} is null and ${t.groupId} is null`),
    uniqueIndex('memberships_course_unique').on(t.userId, t.orgId, t.courseId).where(sql`${t.courseId} is not null`),
    uniqueIndex('memberships_group_unique').on(t.userId, t.orgId, t.groupId).where(sql`${t.groupId} is not null`),
    index('memberships_org_idx').on(t.orgId),
    // Every request reads the user's memberships (#182); the unique ones above are partial, so they
    // cannot serve it, and without this it scanned the whole organization.
    index('memberships_user_idx').on(t.userId, t.orgId),
    index('memberships_course_idx').on(t.courseId, t.orgId),
    index('memberships_group_idx').on(t.groupId, t.orgId),
  ],
);

/** A signed-in browser. Only the SHA-256 of the session token is stored (#8). */
export const sessions = sqliteTable(
  'sessions',
  {
    /** Hex SHA-256 of the token in the cookie. */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

/**
 * Failed sign-ins in fixed windows, per username ("user:<name>") and per IP ("ip:<address>"),
 * to slow down password guessing (#8). Not tenant-owned.
 */
export const loginAttempts = sqliteTable(
  'login_attempts',
  {
    key: text('key').primaryKey(),
    windowStart: integer('window_start', { mode: 'timestamp' }).notNull(),
    count: integer('count').notNull(),
  },
  (t) => [index('login_attempts_window_idx').on(t.windowStart)],
);

/**
 * Role templates: a named set of capabilities (src/shared/capabilities.ts), referenced by
 * memberships.role. Roles are data, so a new role is a new row, not new code. The built-in ones
 * (admin, coordinator, pedagog, assistant, student) are seeded by migration 0003.
 */
export const roles = sqliteTable('roles', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  /** JSON array of capability strings. */
  capabilities: text('capabilities', { mode: 'json' }).$type<string[]>().notNull(),
  position: integer('position').notNull(),
});

/** A lab's notebook (#14): the main material, extra exercises, or the solutions. */
export const notebooks = sqliteTable(
  'notebooks',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    labId: text('lab_id').notNull(),
    kind: text('kind', { enum: ['main', 'extra', 'solution'] }).notNull(),
    title: text('title').notNull(),
    position: integer('position').notNull(),
    /** The uploaded file's name, for downloads. */
    originalName: text('original_name').notNull(),
    /** SHA-256 of the original .ipynb, to notice re-uploads of the same file. */
    sha256: text('sha256').notNull(),
    /** Set once all its files are uploaded; until then nobody but staff sees it. */
    readyAt: integer('ready_at', { mode: 'timestamp' }),
    /** When staff last uploaded a new version in its place (#208), and which of its cells changed then. */
    versionAt: integer('version_at', { mode: 'timestamp' }),
    changedCells: text('changed_cells', { mode: 'json' }).$type<number[]>(),
    /** The version before that, and how its cells map to this one's: a save from a page still showing it lands in the right cell. */
    previousVersion: text('previous_version'),
    cellMap: text('cell_map', { mode: 'json' }).$type<[number, number][]>(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('notebooks_id_org_unique').on(t.id, t.orgId),
    foreignKey({
      name: 'notebooks_lab_fk',
      columns: [t.labId, t.orgId],
      foreignColumns: [labs.id, labs.orgId],
    }).onDelete('cascade'),
    index('notebooks_lab_idx').on(t.labId, t.orgId),
  ],
);

/**
 * A stored file: a notebook's original, its converted cells, or one of its images and figures.
 * Kept in file_chunks of at most 512 KB, since D1 allows 2 MB per value. Converted cells and
 * Plotly figures arrive gzipped from the browser and are served as they are.
 */
export const files = sqliteTable(
  'files',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    notebookId: text('notebook_id'),
    name: text('name').notNull(),
    mime: text('mime').notNull(),
    encoding: text('encoding', { enum: ['identity', 'gzip'] })
      .notNull()
      .default('identity'),
    /** Stored bytes (after any encoding). */
    size: integer('size').notNull(),
    chunkCount: integer('chunk_count').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('files_id_org_unique').on(t.id, t.orgId),
    foreignKey({
      name: 'files_notebook_fk',
      columns: [t.notebookId, t.orgId],
      foreignColumns: [notebooks.id, notebooks.orgId],
    }).onDelete('cascade'),
    uniqueIndex('files_notebook_name_unique').on(t.orgId, t.notebookId, t.name),
  ],
);

export const fileChunks = sqliteTable(
  'file_chunks',
  {
    orgId: orgId(),
    fileId: text('file_id').notNull(),
    n: integer('n').notNull(),
    data: bytes('data').notNull(),
  },
  (t) => [
    primaryKey({ name: 'file_chunks_pk', columns: [t.orgId, t.fileId, t.n] }),
    foreignKey({
      name: 'file_chunks_file_fk',
      columns: [t.fileId, t.orgId],
      foreignColumns: [files.id, files.orgId],
    }).onDelete('cascade'),
  ],
);

/** A visualization shown at one cell of a notebook (#14): which one, and with what settings. */
export const embeds = sqliteTable(
  'embeds',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    notebookId: text('notebook_id').notNull(),
    /** The cell's index in the .ipynb (srcIndex). */
    cell: integer('cell').notNull(),
    viz: text('viz').notNull(),
    title: text('title'),
    props: text('props', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'embeds_notebook_fk',
      columns: [t.notebookId, t.orgId],
      foreignColumns: [notebooks.id, notebooks.orgId],
    }).onDelete('cascade'),
    uniqueIndex('embeds_notebook_cell_unique').on(t.orgId, t.notebookId, t.cell),
  ],
);

/**
 * A notebook's search index (#17): one row per section (heading, text, the names its code defines),
 * made where the notebook was converted. Search reads these rows for the labs the user may see.
 * Plain rows rather than an FTS5 table: D1 cannot export a database with virtual tables, and the
 * weekly backup is an export.
 */
export const searchSections = sqliteTable(
  'search_sections',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    notebookId: text('notebook_id').notNull(),
    position: integer('position').notNull(),
    /** The heading's anchor on the lab page; null for the text above the first heading. */
    anchor: text('anchor'),
    title: text('title').notNull(),
    text: text('text').notNull(),
    keywords: text('keywords').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'search_sections_notebook_fk',
      columns: [t.notebookId, t.orgId],
      foreignColumns: [notebooks.id, notebooks.orgId],
    }).onDelete('cascade'),
    uniqueIndex('search_sections_notebook_position_unique').on(t.orgId, t.notebookId, t.position),
  ],
);

/**
 * Learning activity (#18): that a student opened a lab, downloaded its notebook or used one of its
 * visualizations on a day. At most one row per student, lab, kind and day, so a busy class stays
 * small; reports show only counts. Gone with the student or the lab.
 */
export const labActivity = sqliteTable(
  'lab_activity',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    labId: text('lab_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['view', 'download', 'visualization', 'exercise', 'run', 'live'] }).notNull(),
    /** YYYY-MM-DD in the institution's time zone. */
    day: text('day').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'lab_activity_lab_fk',
      columns: [t.labId, t.orgId],
      foreignColumns: [labs.id, labs.orgId],
    }).onDelete('cascade'),
    uniqueIndex('lab_activity_unique').on(t.orgId, t.labId, t.userId, t.kind, t.day),
  ],
);

/**
 * A student's own version of a notebook's code cell (#49), saved as they type. Private: only its
 * author reads it; staff see a student's code only once it is submitted. Gone with the notebook or
 * the user.
 */
export const codeEdits = sqliteTable(
  'code_edits',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    notebookId: text('notebook_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The cell's index in the .ipynb (srcIndex). */
    cell: integer('cell').notNull(),
    code: text('code').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    foreignKey({
      name: 'code_edits_notebook_fk',
      columns: [t.notebookId, t.orgId],
      foreignColumns: [notebooks.id, notebooks.orgId],
    }).onDelete('cascade'),
    uniqueIndex('code_edits_unique').on(t.orgId, t.userId, t.notebookId, t.cell),
  ],
);

/**
 * A notebook's exercises (#51): running `cell` checks the student's work, with the cell's own
 * `kontrollo(…)` call or with `test`, a visible test staff wrote. Found when the notebook is
 * converted; staff can change them.
 */
export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    notebookId: text('notebook_id').notNull(),
    /** The cell's index in the .ipynb (srcIndex). */
    cell: integer('cell').notNull(),
    title: text('title').notNull(),
    test: text('test'),
    /** What "Explain my error" may say on this exercise (#86): nothing, hints, or the full fix. */
    aiMode: text('ai_mode', { enum: ['off', 'hints', 'full'] })
      .notNull()
      .default('hints'),
    /** Hints staff wrote (#215), from gentle to nearly the answer; students reveal them in order. */
    hints: text('hints', { mode: 'json' }).$type<string[]>(),
  },
  (t) => [
    foreignKey({
      name: 'exercises_notebook_fk',
      columns: [t.notebookId, t.orgId],
      foreignColumns: [notebooks.id, notebooks.orgId],
    }).onDelete('cascade'),
    uniqueIndex('exercises_notebook_cell_unique').on(t.orgId, t.notebookId, t.cell),
  ],
);

/**
 * A student completed an exercise (#51): kept once, the first time its check passed in their
 * browser. Practice, not grading: staff see only how many completed each.
 */
export const exerciseCompletions = sqliteTable(
  'exercise_completions',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    notebookId: text('notebook_id').notNull(),
    cell: integer('cell').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    completedAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'exercise_completions_notebook_fk',
      columns: [t.notebookId, t.orgId],
      foreignColumns: [notebooks.id, notebooks.orgId],
    }).onDelete('cascade'),
    uniqueIndex('exercise_completions_unique').on(t.orgId, t.notebookId, t.cell, t.userId),
  ],
);

/**
 * A student's rows of a graded trace table (#168), saved as they fill them while its notebook is open
 * for submission. Private like their code edits: staff read them only once handed in, as a copy in the
 * submission. Gone with the notebook or the user.
 */
export const traceAnswers = sqliteTable(
  'trace_answers',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    notebookId: text('notebook_id').notNull(),
    /** The trace table's embed cell. */
    cell: integer('cell').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rows: text('rows', { mode: 'json' }).$type<Record<string, string>[]>().notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    foreignKey({
      name: 'trace_answers_notebook_fk',
      columns: [t.notebookId, t.orgId],
      foreignColumns: [notebooks.id, notebooks.orgId],
    }).onDelete('cascade'),
    uniqueIndex('trace_answers_unique').on(t.orgId, t.notebookId, t.cell, t.userId),
  ],
);

/**
 * A student's first answer to one decision of an embedded visualization (#151): a predict question
 * or a trace table's row, right or not and what they picked. Kept once; later tries change nothing.
 * Practice, not grading: staff read it only as counts. Gone with the notebook or the user.
 */
/**
 * A hint a student revealed (#215): once per student, exercise and hint, on the day they did. Shown to
 * them again on every visit, and to staff only as counts. Kept as long as activity, like first tries.
 */
export const hintReveals = sqliteTable(
  'hint_reveals',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    notebookId: text('notebook_id').notNull(),
    /** The exercise's cell in the notebook. */
    cell: integer('cell').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 1, 2 or 3. */
    hint: integer('hint').notNull(),
    /** YYYY-MM-DD in the institution's time zone. */
    day: text('day').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'hint_reveals_notebook_fk',
      columns: [t.notebookId, t.orgId],
      foreignColumns: [notebooks.id, notebooks.orgId],
    }).onDelete('cascade'),
    uniqueIndex('hint_reveals_unique').on(t.orgId, t.notebookId, t.cell, t.userId, t.hint),
    index('hint_reveals_day_idx').on(t.day),
  ],
);

export const predictionResults = sqliteTable(
  'prediction_results',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    notebookId: text('notebook_id').notNull(),
    /** The embed's cell in the notebook. */
    cell: integer('cell').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    topic: text('topic').notNull(),
    decision: text('decision').notNull(),
    correct: integer('correct', { mode: 'boolean' }).notNull(),
    pick: text('pick').notNull(),
    answer: text('answer').notNull(),
    prompt: text('prompt').notNull(),
    /** YYYY-MM-DD in the institution's time zone. */
    day: text('day').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'prediction_results_notebook_fk',
      columns: [t.notebookId, t.orgId],
      foreignColumns: [notebooks.id, notebooks.orgId],
    }).onDelete('cascade'),
    uniqueIndex('prediction_results_unique').on(t.orgId, t.notebookId, t.cell, t.userId, t.decision),
  ],
);

/**
 * A notebook opened for submission to one group (#52), until its deadline. Closing it removes the
 * row; the work already handed in stays.
 */
export const assignments = sqliteTable(
  'assignments',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    notebookId: text('notebook_id').notNull(),
    groupId: text('group_id').notNull(),
    dueAt: integer('due_at', { mode: 'timestamp' }).notNull(),
    /** A kolokium (#169): when students may start, and the minutes each has from their start. */
    opensAt: integer('opens_at', { mode: 'timestamp' }),
    minutes: integer('minutes'),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'assignments_notebook_fk',
      columns: [t.notebookId, t.orgId],
      foreignColumns: [notebooks.id, notebooks.orgId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'assignments_group_fk',
      columns: [t.groupId, t.orgId],
      foreignColumns: [groups.id, groups.orgId],
    }).onDelete('cascade'),
    uniqueIndex('assignments_notebook_group_unique').on(t.orgId, t.notebookId, t.groupId),
  ],
);

/**
 * When a student started a kolokium (#169): their clock runs from here, for the assignment's minutes.
 * One per student and notebook; starting again changes nothing.
 */
export const kolokiumStarts = sqliteTable(
  'kolokium_starts',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    notebookId: text('notebook_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    foreignKey({
      name: 'kolokium_starts_notebook_fk',
      columns: [t.notebookId, t.orgId],
      foreignColumns: [notebooks.id, notebooks.orgId],
    }).onDelete('cascade'),
    uniqueIndex('kolokium_starts_unique').on(t.orgId, t.notebookId, t.userId),
  ],
);

/**
 * A student's work handed in for a notebook (#52): their own code for the cells they changed and
 * the exercises solved, copied from their account at that moment. One per student and notebook,
 * replaced on each resubmission until the deadline. Only its author and the staff who review their
 * group read it.
 */
export const submissions = sqliteTable(
  'submissions',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    notebookId: text('notebook_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The student's code for each cell they changed, by srcIndex; the rest is the notebook's. */
    code: text('code', { mode: 'json' }).$type<{ cell: number; code: string }[]>().notNull(),
    /** The exercises (cells) solved when it was handed in. */
    solved: text('solved', { mode: 'json' }).$type<number[]>().notNull(),
    /** The graded trace tables' rows as the student filled them, by embed cell (#168). */
    traces: text('traces', { mode: 'json' })
      .$type<{ cell: number; rows: Record<string, string>[] }[]>()
      .notNull()
      .default(sql`'[]'`),
    attempts: integer('attempts').notNull(),
    submittedAt: integer('submitted_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    foreignKey({
      name: 'submissions_notebook_fk',
      columns: [t.notebookId, t.orgId],
      foreignColumns: [notebooks.id, notebooks.orgId],
    }).onDelete('cascade'),
    uniqueIndex('submissions_notebook_user_unique').on(t.orgId, t.notebookId, t.userId),
  ],
);

/**
 * How an exercise is graded (#53): its points and an optional hidden test, run after the visible
 * check. Staff only: never sent to students.
 */
export const exerciseGrading = sqliteTable(
  'exercise_grading',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    notebookId: text('notebook_id').notNull(),
    cell: integer('cell').notNull(),
    points: integer('points').notNull(),
    hiddenTest: text('hidden_test'),
  },
  (t) => [
    foreignKey({
      name: 'exercise_grading_notebook_fk',
      columns: [t.notebookId, t.orgId],
      foreignColumns: [notebooks.id, notebooks.orgId],
    }).onDelete('cascade'),
    uniqueIndex('exercise_grading_unique').on(t.orgId, t.notebookId, t.cell),
  ],
);

/**
 * A student's grade for a notebook (#53), from the pedagog's re-run of their submission. `score`
 * is the pedagog's adjustment, if any; students see the grade once it is released.
 */
export const grades = sqliteTable(
  'grades',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    notebookId: text('notebook_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    autoScore: integer('auto_score').notNull(),
    maxScore: integer('max_score').notNull(),
    /** Each exercise's result in the re-run, by cell. */
    results: text('results', { mode: 'json' }).$type<{ cell: number; status: string }[]>().notNull(),
    /** Each graded trace table's rows right, scored by the server (#168); included in autoScore. */
    traces: text('traces', { mode: 'json' })
      .$type<{ cell: number; rows: number; right: number; points: number; score: number }[]>()
      .notNull()
      .default(sql`'[]'`),
    score: integer('score'),
    feedback: text('feedback'),
    gradedAt: integer('graded_at', { mode: 'timestamp' }).notNull(),
    releasedAt: integer('released_at', { mode: 'timestamp' }),
  },
  (t) => [
    foreignKey({
      name: 'grades_notebook_fk',
      columns: [t.notebookId, t.orgId],
      foreignColumns: [notebooks.id, notebooks.orgId],
    }).onDelete('cascade'),
    uniqueIndex('grades_notebook_user_unique').on(t.orgId, t.notebookId, t.userId),
  ],
);

/**
 * A Live Lab session (#65): a lab taught live, from start to end. The connections live in the
 * session's Durable Object; this row says who hosts it and whether it still runs. At most one
 * running session per lab.
 */
export const liveSessions = sqliteTable(
  'live_sessions',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    labId: text('lab_id').notNull(),
    hostId: text('host_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
    endedAt: integer('ended_at', { mode: 'timestamp' }),
  },
  (t) => [
    foreignKey({
      name: 'live_sessions_lab_fk',
      columns: [t.labId, t.orgId],
      foreignColumns: [labs.id, labs.orgId],
    }).onDelete('cascade'),
    uniqueIndex('live_sessions_running_unique').on(t.orgId, t.labId).where(sql`${t.endedAt} is null`),
  ],
);

/**
 * AI use per user, course and day (#84): requests and Workers AI neurons, so quotas are checked
 * before every call. Counts only, never the question or the answer.
 */
export const aiUsage = sqliteTable(
  'ai_usage',
  {
    orgId: orgId(),
    courseId: text('course_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** UTC, as YYYY-MM-DD. */
    day: text('day').notNull(),
    requests: integer('requests').notNull().default(0),
    neurons: real('neurons').notNull().default(0),
  },
  (t) => [
    primaryKey({ name: 'ai_usage_pk', columns: [t.orgId, t.courseId, t.userId, t.day] }),
    foreignKey({
      name: 'ai_usage_course_fk',
      columns: [t.courseId, t.orgId],
      foreignColumns: [courses.id, courses.orgId],
    }).onDelete('cascade'),
    index('ai_usage_org_day_idx').on(t.orgId, t.day),
    index('ai_usage_user_day_idx').on(t.orgId, t.userId, t.day),
  ],
);

/**
 * A student's "Explain my error" (#86): their code, the error and the answer, which staff who
 * review the student's group may read (students are told). Deleted after 180 days.
 */
export const aiQuestions = sqliteTable(
  'ai_questions',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    courseId: text('course_id').notNull(),
    notebookId: text('notebook_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cell: integer('cell').notNull(),
    code: text('code').notNull(),
    error: text('error').notNull(),
    answer: text('answer').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'ai_questions_course_fk',
      columns: [t.courseId, t.orgId],
      foreignColumns: [courses.id, courses.orgId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'ai_questions_notebook_fk',
      columns: [t.notebookId, t.orgId],
      foreignColumns: [notebooks.id, notebooks.orgId],
    }).onDelete('cascade'),
    index('ai_questions_course_idx').on(t.orgId, t.courseId, t.createdAt),
    index('ai_questions_created_idx').on(t.createdAt),
  ],
);

/**
 * A user asked their institution to delete their data (#100). The institution's admin sees it and
 * marks it handled; nothing is deleted on its own, since a grade may have to stay in its records.
 * At most one open request per user and organization.
 */
export const deletionRequests = sqliteTable(
  'deletion_requests',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    note: text('note'),
    createdAt: createdAt(),
    handledAt: integer('handled_at', { mode: 'timestamp' }),
    handledBy: text('handled_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('deletion_requests_open_unique').on(t.orgId, t.userId).where(sql`${t.handledAt} is null`),
    index('deletion_requests_org_idx').on(t.orgId, t.createdAt),
  ],
);

/**
 * That the institution erased a person's data (#115), kept so it can show it acted on the request.
 * Nothing about the person: not their name, account or note, only when it was asked and done.
 */
export const erasures = sqliteTable(
  'erasures',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    requestedAt: integer('requested_at', { mode: 'timestamp' }).notNull(),
    erasedAt: createdAt(),
    erasedBy: text('erased_by').references(() => users.id, { onDelete: 'set null' }),
    /** The account itself went too, as it belonged to no other institution. */
    accountDeleted: integer('account_deleted', { mode: 'boolean' }).notNull(),
  },
  (t) => [index('erasures_org_idx').on(t.orgId, t.erasedAt)],
);

/** An end-of-semester survey of a course (#102): open until it closes. One per course. */
export const surveys = sqliteTable(
  'surveys',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    courseId: text('course_id').notNull(),
    closesAt: integer('closes_at', { mode: 'timestamp' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('surveys_id_org_unique').on(t.id, t.orgId),
    uniqueIndex('surveys_course_unique').on(t.orgId, t.courseId),
    foreignKey({
      name: 'surveys_course_fk',
      columns: [t.courseId, t.orgId],
      foreignColumns: [courses.id, courses.orgId],
    }).onDelete('cascade'),
  ],
);

/**
 * The survey's ratings as counts only (#102): how many gave `score` to `question`. No row is a
 * student's answer, so no answer can be traced back to one.
 */
export const surveyRatings = sqliteTable(
  'survey_ratings',
  {
    orgId: orgId(),
    surveyId: text('survey_id').notNull(),
    question: text('question').notNull(),
    score: integer('score').notNull(),
    n: integer('n').notNull().default(0),
  },
  (t) => [
    primaryKey({ name: 'survey_ratings_pk', columns: [t.orgId, t.surveyId, t.question, t.score] }),
    foreignKey({
      name: 'survey_ratings_survey_fk',
      columns: [t.surveyId, t.orgId],
      foreignColumns: [surveys.id, surveys.orgId],
    }).onDelete('cascade'),
  ],
);

/**
 * The survey's comments (#102), with random ids, no time and no author. The migration makes the
 * table WITHOUT ROWID, so even the storage order says nothing about who wrote which.
 */
export const surveyComments = sqliteTable(
  'survey_comments',
  {
    id: text('id').primaryKey(),
    orgId: orgId(),
    surveyId: text('survey_id').notNull(),
    text: text('text').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'survey_comments_survey_fk',
      columns: [t.surveyId, t.orgId],
      foreignColumns: [surveys.id, surveys.orgId],
    }).onDelete('cascade'),
    index('survey_comments_survey_idx').on(t.orgId, t.surveyId),
  ],
);

/** Who answered (#102), only so each student answers once and is asked once. Not what they said. */
export const surveyRespondents = sqliteTable(
  'survey_respondents',
  {
    orgId: orgId(),
    surveyId: text('survey_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ name: 'survey_respondents_pk', columns: [t.orgId, t.surveyId, t.userId] }),
    foreignKey({
      name: 'survey_respondents_survey_fk',
      columns: [t.surveyId, t.orgId],
      foreignColumns: [surveys.id, surveys.orgId],
    }).onDelete('cascade'),
  ],
);

import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  foreignKey,
  index,
  integer,
  primaryKey,
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
    kind: text('kind', { enum: ['view', 'download', 'visualization'] }).notNull(),
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

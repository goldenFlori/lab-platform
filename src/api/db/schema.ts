import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Conventions for every table:
// - ids are random text (UUIDv7), never sequential;
// - timestamps are Unix seconds, set by the database;
// - every tenant-owned row carries org_id, and points to its parent through (parent_id, org_id),
//   so the database itself refuses a row that links to another organization's data;
// - every unique index on a tenant-owned table includes org_id, so a uniqueness check never
//   compares rows of two organizations (its error would reveal what the other one has).

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

import { and, eq, type InferInsertModel, type InferSelectModel, inArray, type SQL } from 'drizzle-orm';
import { uuidv7 } from './ids';
import type { Db } from './index';
import { courses, courseTemplates, groups, labAccess, labs, memberships, users } from './schema';

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

type TenantTable =
  | typeof courseTemplates
  | typeof courses
  | typeof groups
  | typeof labs
  | typeof labAccess
  | typeof memberships;

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
      return base.create(values);
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
    courses: tenantTable(db, orgId, courses),
    groups: tenantTable(db, orgId, groups),
    labs: tenantTable(db, orgId, labs),
    labAccess: tenantTable(db, orgId, labAccess),
  };
}

export type TenantDb = ReturnType<typeof forTenant>;

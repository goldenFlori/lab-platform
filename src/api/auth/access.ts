import type { Context, MiddlewareHandler } from 'hono';
import { type AccessSummary, type Capability, isCapability } from '../../shared/capabilities';
import { createDb } from '../db';
import { findOrganizationBySlug, grantsOf } from '../db/access';
import { forTenant, type TenantDb } from '../db/tenant';
import type { AppEnv } from '../env';

// Permissions per request. A membership gives its role's capabilities in one scope:
// - the organization (no course or group): everywhere in it;
// - a course: in that course and all of its groups;
// - a group: in that group.
// The UI may hide what a user cannot do, but only these checks decide.

export type Grant = { courseId: string | null; groupId: string | null; capabilities: readonly Capability[] };

/** Where an action happens. For anything inside a group, pass its course too, so course roles apply. */
export type Target = { courseId?: string; groupId?: string };

export class Access {
  constructor(private readonly grants: readonly Grant[]) {}

  /** May the user do this here? */
  can(capability: Capability, target: Target = {}): boolean {
    return this.grants.some(
      (grant) =>
        grant.capabilities.includes(capability) &&
        ((grant.courseId === null && grant.groupId === null) ||
          (grant.courseId !== null && grant.courseId === target.courseId) ||
          (grant.groupId !== null && grant.groupId === target.groupId)),
    );
  }

  /** May the user do this somewhere in the organization? For showing an entry point, not for allowing it. */
  canSomewhere(capability: Capability): boolean {
    return this.grants.some((grant) => grant.capabilities.includes(capability));
  }

  summary(): AccessSummary['capabilities'] {
    const add = (list: Capability[] = [], more: readonly Capability[]) => [...new Set([...list, ...more])].sort();
    const result: AccessSummary['capabilities'] = { organization: [], courses: {}, groups: {} };
    for (const grant of this.grants) {
      if (grant.groupId) result.groups[grant.groupId] = add(result.groups[grant.groupId], grant.capabilities);
      else if (grant.courseId) result.courses[grant.courseId] = add(result.courses[grant.courseId], grant.capabilities);
      else result.organization = add(result.organization, grant.capabilities);
    }
    return result;
  }
}

/** Routes under /api/orgs/:org see the organization, the tenant-scoped data layer and the user's access. */
export type TenantEnv = AppEnv & {
  Variables: AppEnv['Variables'] & {
    organization: AccessSummary['organization'];
    tenant: TenantDb;
    access: Access;
  };
};

/**
 * Resolves the organization in the URL and the signed-in user's access to it. Someone who is not
 * a member gets the same 404 as for an organization that does not exist.
 */
export const tenantAccess: MiddlewareHandler<TenantEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  const db = createDb(c.env.DB);
  const organization = await findOrganizationBySlug(db, c.req.param('org') ?? '');
  const grants = organization ? await grantsOf(db, organization.id, user.id) : [];
  if (!organization || grants.length === 0) return c.json({ error: 'not_found' }, 404);

  c.set('organization', organization);
  c.set('tenant', forTenant(db, organization.id));
  c.set(
    'access',
    new Access(
      grants.map((grant) => ({
        courseId: grant.courseId,
        groupId: grant.groupId,
        // Unknown strings are ignored, so a stale role can never grant something by accident.
        capabilities: grant.capabilities.filter(isCapability),
      })),
    ),
  );
  await next();
};

/**
 * Refuses the request unless the user has the capability where the action happens. For resources
 * that must first be loaded, check `c.var.access.can(...)` in the handler instead.
 */
export function requireCapability(
  capability: Capability,
  target: (c: Context<TenantEnv>) => Target = () => ({}),
): MiddlewareHandler<TenantEnv> {
  return async (c, next) => {
    if (!c.get('access').can(capability, target(c))) return c.json({ error: 'forbidden' }, 403);
    await next();
  };
}

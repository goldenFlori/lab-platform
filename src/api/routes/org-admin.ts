import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  type OrgPeoplePage,
  type OrgPerson,
  orgRoleInput,
  orgSettingsInput,
  orgStaffInput,
} from '../../shared/org-admin';
import { isOrgRole } from '../../shared/org-roles';
import type { TenantEnv } from '../auth/access';
import { NotFoundError } from '../db/tenant';
import { forbidden, invalidRequest } from './course-context';

// The institution admin's page (#202), under /api/orgs/:org, for those with org.manage: its people and
// their roles across the institution, a new staff account, and its language and AI policy.

const person = (row: {
  id: string;
  username: string;
  fullName: string;
  orgRole: string | null;
  teaches: number;
  studies: number;
}): OrgPerson => ({ ...row, orgRole: isOrgRole(row.orgRole) ? row.orgRole : null });

export const orgAdminRoutes = new Hono<TenantEnv>()
  .use(async (c, next) => (c.var.access.can('org.manage') ? next() : forbidden(c)))

  .get('/people', async (c) => {
    const page = await c.var.tenant.people.page(c.req.query('q') ?? '', c.req.query('after') ?? '');
    return c.json({ people: page.people.map(person), next: page.next } satisfies OrgPeoplePage);
  })

  // A staff account with a role across the institution; its password was made in the admin's browser.
  .post('/people', zValidator('json', orgStaffInput, invalidRequest), async (c) => {
    const { fullName, username, role, passwordHash } = c.req.valid('json');
    if (await c.var.tenant.people.usernameTaken(username)) return c.json({ error: 'username_taken' }, 409);
    const user = await c.var.tenant.users.create({ username, fullName, passwordHash }, role);
    return c.json({ id: user.id, username: user.username }, 201);
  })

  // Gives, changes or takes away someone's role across the institution, never one's own: only an admin
  // changes roles, so an institution always keeps at least the admin who acts. A person whose only
  // membership was this role leaves the institution (their account stays).
  .put('/people/:userId/role', zValidator('json', orgRoleInput, invalidRequest), async (c) => {
    const userId = c.req.param('userId');
    if (!(await c.var.tenant.users.get(userId))) throw new NotFoundError();
    if (userId === c.var.user?.id) return c.json({ error: 'own_account' }, 409);
    const { role } = c.req.valid('json');
    const { people, memberships } = c.var.tenant;
    const current = await people.orgMembership(userId);
    if (!role) {
      if (current) await memberships.remove(current.id);
    } else if (current) {
      await memberships.update(current.id, { role });
    } else {
      await memberships.create({ userId, role });
    }
    return c.body(null, 204);
  })

  .put('/settings', zValidator('json', orgSettingsInput, invalidRequest), async (c) => {
    await c.var.tenant.branding.setSettings(c.req.valid('json'));
    return c.body(null, 204);
  });

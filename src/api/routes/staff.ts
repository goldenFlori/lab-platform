import { zValidator } from '@hono/zod-validator';
import { type Context, Hono } from 'hono';
import { addStaffInput, createStaffInput, type StaffMember } from '../../shared/staff';
import type { TenantEnv } from '../auth/access';
import { NotFoundError } from '../db/tenant';
import { forbidden, invalidRequest, visibleCourse } from './course-context';

// A course's teaching staff (#64), under /api/orgs/:org/courses/:courseId/staff. Staff who manage
// the course add pedagogs and assistants, for the whole course or one group, and remove them; the
// last course-wide pedagog stays. Accounts are found only among the organization's own members.

async function managedCourse(c: Context<TenantEnv>) {
  const { course, groups } = await visibleCourse(c);
  return { course, groups, allowed: c.var.access.can('course.manage', { courseId: course.id }) };
}

/** Where the role applies: the course, or one of its groups. */
function scopeOf(groups: { id: string }[], courseId: string, groupId: string | null) {
  if (groupId === null) return { courseId };
  if (!groups.some((g) => g.id === groupId)) throw new NotFoundError();
  return { groupId };
}

export const staffRoutes = new Hono<TenantEnv>()
  .get('/', async (c) => {
    const { course, allowed } = await managedCourse(c);
    if (!allowed) return forbidden(c);
    return c.json((await c.var.tenant.staff.list(course.id)) satisfies StaffMember[]);
  })

  .post('/', zValidator('json', addStaffInput, invalidRequest), async (c) => {
    const { course, groups, allowed } = await managedCourse(c);
    if (!allowed) return forbidden(c);
    const { username, role, groupId } = c.req.valid('json');
    const scope = scopeOf(groups, course.id, groupId);
    const userId = await c.var.tenant.staff.findMember(username);
    if (!userId) return c.json({ error: 'not_found' }, 404);
    // One role per person in the course and in each group.
    if (await c.var.tenant.staff.hasRoleIn(userId, scope)) return c.json({ error: 'already' }, 409);
    await c.var.tenant.memberships.create({ userId, role, ...scope });
    return c.json(await c.var.tenant.staff.list(course.id), 201);
  })

  .post('/new', zValidator('json', createStaffInput, invalidRequest), async (c) => {
    const { course, groups, allowed } = await managedCourse(c);
    if (!allowed) return forbidden(c);
    const { role, groupId, ...account } = c.req.valid('json');
    const user = await c.var.tenant.staff.createInto(scopeOf(groups, course.id, groupId), role, account);
    return c.json({ user, staff: await c.var.tenant.staff.list(course.id) }, 201);
  })

  .delete('/:membershipId', async (c) => {
    const { course, allowed } = await managedCourse(c);
    if (!allowed) return forbidden(c);
    const id = c.req.param('membershipId');
    const member = (await c.var.tenant.staff.list(course.id)).find((m) => m.id === id);
    if (!member) throw new NotFoundError();
    const pedagogs = await c.var.tenant.staff.pedagogs(course.id);
    if (pedagogs.length === 1 && pedagogs[0] === id) return c.json({ error: 'last_pedagog' }, 409);
    await c.var.tenant.memberships.remove(id);
    return c.body(null, 204);
  });

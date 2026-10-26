import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { ruleForGroup, solutionsOpen, stateOf } from '../../shared/lab-visibility';
import { type LabList, type LabRule, type LabView, labAccessInput, labInput, updateLabInput } from '../../shared/labs';
import type { TenantEnv } from '../auth/access';
import { NotFoundError } from '../db/tenant';
import { labActivityRoutes } from './activity';
import { forbidden, invalidRequest } from './course-context';
import { kolokiumViews, type Lab, type LabContext, labContext, openToViewer, visibleLab } from './lab-context';
import { liveRoutes } from './live';
import { notebookRoutes } from './notebooks';

// Labs of a course and when they are open (#12), under /api/orgs/:org/courses/:courseId/labs.

const iso = (date: Date | null) => date?.toISOString() ?? null;
const toDate = (value: string | null) => (value ? new Date(value) : null);

function view(ctx: LabContext, lab: Lab): LabView {
  const rules = ctx.rulesOf(lab.id);
  const base = { id: lab.id, n: lab.n, title: lab.title, week: lab.week, summary: lab.summary };
  if (!ctx.staff) {
    const solutionsAvailable = ctx.viewerGroups.some((groupId) => solutionsOpen(ruleForGroup(rules, groupId), ctx.now));
    // Its kolokia (#169), also before the student may read the notebook, so the page can offer to start.
    const kolokia = kolokiumViews(ctx, lab.id).map(({ labId: _, ...k }) => k);
    return { ...base, solutionsAvailable, ...(kolokia.length ? { kolokia } : {}) };
  }
  return {
    ...base,
    solutionsAvailable: true,
    visibility: {
      rules: rules.map(
        (rule): LabRule => ({
          groupId: rule.groupId,
          visibleFrom: iso(rule.visibleFrom),
          visibleUntil: iso(rule.visibleUntil),
          solutionsFrom: iso(rule.solutionsFrom),
        }),
      ),
      course: stateOf(
        rules.find((rule) => rule.groupId === null),
        ctx.now,
      ),
      groups: ctx.groups.map((group) => ({
        groupId: group.id,
        state: stateOf(ruleForGroup(rules, group.id), ctx.now),
        ownRule: rules.some((rule) => rule.groupId === group.id),
      })),
    },
  };
}

export const labRoutes = new Hono<TenantEnv>()
  .get('/', async (c) => {
    const ctx = await labContext(c);
    const { access } = c.var;
    return c.json({
      labs: ctx.labs.filter((lab) => ctx.staff || openToViewer(ctx, lab)).map((lab) => view(ctx, lab)),
      permissions: {
        manage: access.can('course.manage', { courseId: ctx.course.id }),
        publish: access.can('lab.publish', { courseId: ctx.course.id }),
        staff: ctx.staff,
      },
    } satisfies LabList);
  })

  .get('/:labId', async (c) => {
    const ctx = await labContext(c);
    return c.json(view(ctx, visibleLab(c, ctx)));
  })

  .post('/', zValidator('json', labInput, invalidRequest), async (c) => {
    const ctx = await labContext(c);
    if (!c.var.access.can('course.manage', { courseId: ctx.course.id })) return forbidden(c);
    const input = c.req.valid('json');
    const lab = await c.var.tenant.labs.create({
      courseId: ctx.course.id,
      n: input.n,
      title: input.title,
      week: input.week ?? null,
      summary: input.summary ?? null,
      position: input.n,
    });
    return c.json(view({ ...ctx, labs: [...ctx.labs, lab] }, lab), 201);
  })

  .patch('/:labId', zValidator('json', updateLabInput, invalidRequest), async (c) => {
    const ctx = await labContext(c);
    const lab = visibleLab(c, ctx);
    if (!c.var.access.can('course.manage', { courseId: ctx.course.id })) return forbidden(c);
    const input = c.req.valid('json');
    const updated = await c.var.tenant.labs.update(lab.id, {
      ...input,
      ...(input.n !== undefined ? { position: input.n } : {}),
    });
    return c.json(view(ctx, updated ?? lab));
  })

  .delete('/:labId', async (c) => {
    const ctx = await labContext(c);
    const lab = visibleLab(c, ctx);
    if (!c.var.access.can('course.manage', { courseId: ctx.course.id })) return forbidden(c);
    await c.var.tenant.labs.remove(lab.id);
    return c.body(null, 204);
  })

  // Open, schedule or hide a lab, for the whole course or one group. Takes effect at once.
  .put('/:labId/access', zValidator('json', labAccessInput, invalidRequest), async (c) => {
    const ctx = await labContext(c);
    const lab = visibleLab(c, ctx);
    const rule = c.req.valid('json');
    if (rule.groupId !== null && !ctx.groups.some((g) => g.id === rule.groupId)) throw new NotFoundError();
    const target = rule.groupId ? { courseId: ctx.course.id, groupId: rule.groupId } : { courseId: ctx.course.id };
    if (!c.var.access.can('lab.publish', target)) return forbidden(c);
    await c.var.tenant.labAccess.setRule(lab.id, rule.groupId, {
      visibleFrom: toDate(rule.visibleFrom),
      visibleUntil: toDate(rule.visibleUntil),
      solutionsFrom: toDate(rule.solutionsFrom),
    });
    return c.json(view(await labContext(c), lab));
  })

  // A group follows the course-wide rule again.
  .delete('/:labId/access/:groupId', async (c) => {
    const ctx = await labContext(c);
    const lab = visibleLab(c, ctx);
    const groupId = c.req.param('groupId');
    if (!ctx.groups.some((g) => g.id === groupId)) throw new NotFoundError();
    if (!c.var.access.can('lab.publish', { courseId: ctx.course.id, groupId })) return forbidden(c);
    await c.var.tenant.labAccess.removeRule(lab.id, groupId);
    return c.json(view(await labContext(c), lab));
  })

  .route('/:labId/notebooks', notebookRoutes)
  .route('/:labId/activity', labActivityRoutes)
  .route('/:labId/live', liveRoutes);

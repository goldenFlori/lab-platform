import type { Context } from 'hono';
import { type AccessRule, ruleForGroup, solutionsOpen, stateOf } from '../../shared/lab-visibility';
import type { TenantEnv } from '../auth/access';
import { NotFoundError } from '../db/tenant';
import { visibleCourse } from './course-context';

// Shared by the lab and notebook routes: a course's labs as this user may see them (#12, #14).
// Staff (whoever may see solutions in the course) see every lab. Students see only labs open to
// one of their groups right now; any other lab answers 404, also by direct link.

export type Lab = { id: string; n: number; title: string; week: number | null; summary: string | null };
type StoredRule = AccessRule & { labId: string };

/** Everything needed to show a course's labs to the user in this request. */
export async function labContext(c: Context<TenantEnv>) {
  const { course, groups } = await visibleCourse(c);
  const { access, tenant } = c.var;
  const groupIds = groups.map((g) => g.id);
  const [labs, rules] = await Promise.all([tenant.labs.ofCourse(course.id), tenant.labAccess.ofCourse(course.id)]);
  return {
    course,
    groups,
    labs,
    rulesOf: (labId: string) => rules.filter((rule) => rule.labId === labId) as StoredRule[],
    staff: access.canInCourse('solution.view', course.id, groupIds),
    /** The groups whose labs the user sees as a student would. */
    viewerGroups: groupIds.filter((groupId) => access.can('lab.view', { courseId: course.id, groupId })),
    now: new Date(),
  };
}

export type LabContext = Awaited<ReturnType<typeof labContext>>;

/** Solutions are open to this user: staff always, students per their groups' rules. */
export function solutionsOpenTo(ctx: LabContext, lab: Lab) {
  const rules = ctx.rulesOf(lab.id);
  return ctx.staff || ctx.viewerGroups.some((groupId) => solutionsOpen(ruleForGroup(rules, groupId), ctx.now));
}

export function openToViewer(ctx: LabContext, lab: Lab) {
  const rules = ctx.rulesOf(lab.id);
  return ctx.viewerGroups.some((groupId) => stateOf(ruleForGroup(rules, groupId), ctx.now) === 'open');
}

/** A notebook of a lab the user sees: staff see all; students ready ones, and solutions once open. */
export function mayReadNotebook(
  ctx: LabContext,
  lab: Lab,
  nb: { kind: 'main' | 'extra' | 'solution'; readyAt: Date | null },
) {
  if (ctx.staff) return true;
  return nb.readyAt !== null && (nb.kind !== 'solution' || solutionsOpenTo(ctx, lab));
}

/** The lab in the URL, or 404 when it is missing or not open to the user. */
export function visibleLab(c: Context<TenantEnv>, ctx: LabContext) {
  const lab = ctx.labs.find((l) => l.id === c.req.param('labId'));
  if (!lab || (!ctx.staff && !openToViewer(ctx, lab))) throw new NotFoundError();
  return lab;
}

/** The lab and notebook in the URL as this user may see them, or 404. */
export async function notebookInUrl(c: Context<TenantEnv>) {
  const ctx = await labContext(c);
  const lab = visibleLab(c, ctx);
  const nb = await c.var.tenant.notebooks.get(c.req.param('notebookId') ?? '');
  if (!nb || nb.labId !== lab.id || !mayReadNotebook(ctx, lab, nb)) throw new NotFoundError();
  return { ctx, lab, nb };
}

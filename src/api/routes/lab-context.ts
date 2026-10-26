import type { Context } from 'hono';
import { type AccessRule, ruleForGroup, solutionsOpen, stateOf } from '../../shared/lab-visibility';
import { type Kolokium, kolokiumEnd } from '../../shared/submissions';
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
  const staff = access.canInCourse('solution.view', course.id, groupIds);
  /** The groups whose labs the user sees as a student would. */
  const viewerGroups = groupIds.filter((groupId) => access.can('lab.view', { courseId: course.id, groupId }));
  const [labs, rules, kolokia] = await Promise.all([
    tenant.labs.ofCourse(course.id),
    tenant.labAccess.ofCourse(course.id),
    staff ? [] : tenant.submissions.kolokiaFor(course.id, viewerGroups, c.var.user?.id ?? ''),
  ]);
  return {
    course,
    groups,
    labs,
    rulesOf: (labId: string) => rules.filter((rule) => rule.labId === labId) as StoredRule[],
    staff,
    viewerGroups,
    /** The kolokia of the viewer's groups (#169), with their start and hand-in; none for staff. */
    kolokia,
    now: new Date(),
  };
}

export type LabContext = Awaited<ReturnType<typeof labContext>>;

/** Solutions are open to this user: staff always, students per their groups' rules. */
export function solutionsOpenTo(ctx: LabContext, lab: Lab) {
  const rules = ctx.rulesOf(lab.id);
  return ctx.staff || ctx.viewerGroups.some((groupId) => solutionsOpen(ruleForGroup(rules, groupId), ctx.now));
}

/** The kolokia running now for the viewer's groups (#169): between their opening and their due time. */
export function runningKolokia(ctx: LabContext) {
  const now = ctx.now.getTime();
  return ctx.kolokia.filter((k) => (k.opensAt?.getTime() ?? Infinity) <= now && now < k.dueAt.getTime());
}

export function openToViewer(ctx: LabContext, lab: Lab) {
  // While a kolokium runs for their group, a student sees its lab and no other (#169).
  const running = runningKolokia(ctx);
  if (running.length) return running.some((k) => k.labId === lab.id);
  const rules = ctx.rulesOf(lab.id);
  return ctx.viewerGroups.some((groupId) => stateOf(ruleForGroup(rules, groupId), ctx.now) === 'open');
}

/** A notebook of a lab the user sees: staff see all; students ready ones, and solutions once open. */
export function mayReadNotebook(
  ctx: LabContext,
  lab: Lab,
  nb: { id: string; kind: 'main' | 'extra' | 'solution'; readyAt: Date | null },
) {
  if (ctx.staff) return true;
  // A kolokium's notebook stays closed until the student starts it, as long as it can still be taken.
  const kolokium = ctx.kolokia.find((k) => k.notebookId === nb.id);
  if (kolokium && !kolokium.startedAt && ctx.now < kolokium.dueAt) return false;
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

/** The viewer's kolokia (#169) as they see them, for one lab or all; their end once they started. */
export function kolokiumViews(ctx: LabContext, labId?: string): (Kolokium & { labId: string })[] {
  return ctx.kolokia
    .filter((k) => k.opensAt && k.minutes && (!labId || k.labId === labId))
    .map((k) => ({
      labId: k.labId,
      notebookId: k.notebookId,
      title: k.title,
      opensAt: (k.opensAt as Date).toISOString(),
      dueAt: k.dueAt.toISOString(),
      minutes: k.minutes as number,
      startedAt: k.startedAt?.toISOString() ?? null,
      endsAt: k.startedAt
        ? new Date(kolokiumEnd(k.startedAt.getTime(), k.minutes as number, k.dueAt.getTime())).toISOString()
        : null,
      submittedAt: k.submittedAt?.toISOString() ?? null,
    }));
}

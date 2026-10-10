import { zValidator } from '@hono/zod-validator';
import { type Context, Hono } from 'hono';
import {
  ACTIVITY_KINDS,
  ACTIVITY_TIME_ZONE,
  type ActivityKind,
  type ActivityReport,
  activityInput,
  REPORT_WEEKS,
} from '../../shared/activity';
import type { TenantEnv } from '../auth/access';
import { forbidden, invalidRequest, visibleCourse } from './course-context';
import { type LabContext, labContext, visibleLab } from './lab-context';

// Learning activity (#18). Students' activity is recorded as they open labs, download notebooks and
// use visualizations; staff with analytics.view read it as weekly counts for the groups they may
// see, never per student. Staff's own activity is not recorded.

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: ACTIVITY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today in the institution's time, as YYYY-MM-DD. */
export const today = (now = new Date()) => dayFormat.format(now);

/** The Monday of the week of a YYYY-MM-DD day. */
export function mondayOf(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * Records a student's activity in a lab after the response, so reading a lab never waits for it
 * and never fails because of it. Staff are not counted.
 */
export function recordActivity(c: Context<TenantEnv>, ctx: LabContext, labId: string, kind: ActivityKind) {
  const userId = c.var.user?.id;
  if (ctx.staff || !userId) return;
  const work = c.var.tenant.activity.record({ labId, userId, kind, day: today() }).catch((error: unknown) => {
    console.error('Activity not recorded', error);
  });
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    // No execution context (outside the Workers runtime): the write still runs.
  }
}

/** POST /api/orgs/:org/courses/:courseId/labs/:labId/activity: the app reports a visualization used. */
export const labActivityRoutes = new Hono<TenantEnv>().post(
  '/',
  zValidator('json', activityInput, invalidRequest),
  async (c) => {
    const ctx = await labContext(c);
    const lab = visibleLab(c, ctx);
    recordActivity(c, ctx, lab.id, c.req.valid('json').kind);
    return c.body(null, 204);
  },
);

/** GET /api/orgs/:org/courses/:courseId/activity[?group=…]: the course's report. */
export const courseActivityRoutes = new Hono<TenantEnv>().get('/', async (c) => {
  const { access, tenant } = c.var;
  const { course, groups } = await visibleCourse(c);
  const wholeCourse = access.can('analytics.view', { courseId: course.id });
  const allowed = groups
    .filter((g) => access.can('analytics.view', { courseId: course.id, groupId: g.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!wholeCourse && allowed.length === 0) return forbidden(c);

  const group = c.req.query('group') || null;
  if (group && !allowed.some((g) => g.id === group)) return forbidden(c);
  const groupIds = group ? [group] : wholeCourse ? null : allowed.map((g) => g.id);

  const thisWeek = mondayOf(today());
  const courseWeek = mondayOf(today(course.createdAt));
  const oldest = addDays(thisWeek, -7 * (REPORT_WEEKS - 1));
  const since = courseWeek > oldest ? courseWeek : oldest;
  const [data, labs] = await Promise.all([
    tenant.activity.report({ courseId: course.id, groupIds, since }),
    tenant.labs.ofCourse(course.id),
  ]);

  const none = () => Object.fromEntries(ACTIVITY_KINDS.map((kind) => [kind, 0])) as Record<ActivityKind, number>;
  const weeks: ActivityReport['weeks'] = [];
  for (let week = since; week <= thisWeek; week = addDays(week, 7)) {
    weeks.push({ week, active: data.perWeek.find((row) => row.week === week)?.students ?? 0, ...none() });
  }
  for (const row of data.perWeekKind) {
    const week = weeks.find((w) => w.week === row.week);
    if (week) week[row.kind] = row.students;
  }
  const perLab = new Map(labs.map((lab) => [lab.id, { id: lab.id, n: lab.n, title: lab.title, ...none() }]));
  for (const row of data.perLab) {
    const lab = perLab.get(row.labId);
    if (lab) lab[row.kind] = row.students;
  }

  return c.json({
    groups: allowed.map((g) => ({ id: g.id, name: g.name })),
    group,
    students: data.students,
    weeks,
    labs: [...perLab.values()],
  } satisfies ActivityReport);
});

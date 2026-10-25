import { zValidator } from '@hono/zod-validator';
import { type Context, Hono } from 'hono';
import {
  ACTIVITY_KINDS,
  ACTIVITY_TIME_ZONE,
  type ActivityKind,
  type ActivityReport,
  activityInput,
  PILOT_MAX_DAYS,
  type PilotCount,
  type PilotReport,
  type PilotUnderstanding,
  REPORT_WEEKS,
} from '../../shared/activity';
import {
  type EmbedUnderstanding,
  type HardDecision,
  MIN_STUDENTS,
  PREDICTION_TOPICS,
  type PredictionTopic,
  type UnderstandingReport,
} from '../../shared/predictions';
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

const clockFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: ACTIVITY_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

/** How far the institution's clock is ahead of UTC at `instant`, in milliseconds. */
function zoneOffset(instant: number) {
  const p = Object.fromEntries(
    clockFormat.formatToParts(new Date(instant)).map((part) => [part.type, Number(part.value)]),
  );
  return (
    Date.UTC(p.year ?? 0, (p.month ?? 1) - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000
  );
}

/**
 * The moment a YYYY-MM-DD day begins in the institution's time (#112): timestamps are compared with
 * this, never with the UTC midnight, which is an hour or two later in Tirana.
 */
export function startOfDay(day: string) {
  const midnightUtc = Date.parse(`${day}T00:00:00Z`);
  const first = midnightUtc - zoneOffset(midnightUtc);
  return new Date(midnightUtc - zoneOffset(first));
}

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

type Learning = Awaited<ReturnType<TenantEnv['Variables']['tenant']['predictions']['pilot']>>;

/** The pilot report's learning section (#153), with the five-student rule applied. */
function understandingOf(learning: Learning, from: string, to: string): PilotUnderstanding {
  const tries = (row: { answers: number; right: number } | undefined) => ({
    answers: Number(row?.answers ?? 0),
    right: Number(row?.right ?? 0),
  });
  const weeks: PilotUnderstanding['weeks'] = [];
  for (let week = mondayOf(from); week <= to; week = addDays(week, 7)) {
    weeks.push({ week, ...tries(learning.perWeek.find((row) => row.week === week)) });
  }
  const first = learning.growth.find((row) => Number(row.first) === 1);
  const later = learning.growth.find((row) => Number(row.first) === 0);
  const growing = Number(first?.students ?? 0);
  return {
    students: Number(learning.totals?.students ?? 0),
    ...tries(learning.totals),
    topics: PREDICTION_TOPICS.flatMap((topic) => {
      const row = learning.perTopic.find((r) => r.topic === topic);
      return row && row.students >= MIN_STUDENTS ? [{ topic, students: row.students, ...tries(row) }] : [];
    }),
    weeks,
    growth: growing >= MIN_STUDENTS ? { students: growing, firstDay: tries(first), later: tries(later) } : null,
    traceRows: { students: Number(learning.trace?.students ?? 0), total: Number(learning.trace?.total ?? 0) },
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);

/**
 * GET /api/orgs/:org/courses/:courseId/report[?from=…&to=…&group=…]: the pilot report (#101) for
 * staff with analytics.view, for the groups they may see. Counts only. The period defaults to the
 * course's start (at most PILOT_MAX_DAYS ago) until today.
 */
export const pilotReportRoutes = new Hono<TenantEnv>().get('/', async (c) => {
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

  const to = c.req.query('to') || today();
  const started = today(course.createdAt);
  const earliest = addDays(to, -(PILOT_MAX_DAYS - 1));
  const from = c.req.query('from') || (started > earliest ? started : earliest);
  if (!DAY.test(from) || !DAY.test(to) || from > to || daysBetween(from, to) >= PILOT_MAX_DAYS) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  const [data, learning] = await Promise.all([
    tenant.activity.pilot({
      courseId: course.id,
      groupIds,
      from,
      to,
      start: startOfDay(from),
      end: new Date(startOfDay(addDays(to, 1)).getTime() - 1),
    }),
    tenant.predictions.pilot({ courseId: course.id, groupIds, from, to }),
  ]);
  const kind = (k: ActivityKind): PilotCount => {
    const row = data.perKind.find((r) => r.kind === k);
    return { students: row?.students ?? 0, total: Number(row?.total ?? 0) };
  };
  const count = (row: { students: number; total: number } | undefined): PilotCount => ({
    students: row?.students ?? 0,
    total: Number(row?.total ?? 0),
  });
  const weeks: PilotReport['weeks'] = [];
  for (let week = mondayOf(from); week <= to; week = addDays(week, 7)) {
    weeks.push({ week, active: data.perWeek.find((row) => row.week === week)?.students ?? 0 });
  }
  return c.json({
    course: { title: course.title, academicYear: course.academicYear },
    groups: allowed.map((g) => ({ id: g.id, name: g.name })),
    group,
    from,
    to,
    students: data.students,
    weeks,
    active: data.active,
    labsOpened: kind('view'),
    codeRuns: kind('run'),
    liveLabs: kind('live'),
    visualizations: kind('visualization'),
    exercisesCompleted: count(data.solved),
    submissions: count(data.handed),
    aiQuestions: count(data.asked),
    aiRequests: data.aiRequests,
    understanding: understandingOf(learning, from, to),
  } satisfies PilotReport);
});

/**
 * GET /api/orgs/:org/courses/:courseId/understanding[?group=…]: first-try results of predictions and
 * trace tables (#151), per embedded visualization, for staff with analytics.view and the groups they
 * may see. Counts only, and only what five students or more stand behind: an embed's totals, and its
 * three hardest decisions with the wrong answer most of them gave.
 */
export const understandingRoutes = new Hono<TenantEnv>().get('/', async (c) => {
  const { access, tenant } = c.var;
  const { course, groups } = await visibleCourse(c);
  const wholeCourse = access.can('analytics.view', { courseId: course.id });
  const allowed = groups.filter((g) => access.can('analytics.view', { courseId: course.id, groupId: g.id }));
  if (!wholeCourse && allowed.length === 0) return forbidden(c);
  const group = c.req.query('group') || null;
  if (group && !allowed.some((g) => g.id === group)) return forbidden(c);
  const groupIds = group ? [group] : wholeCourse ? null : allowed.map((g) => g.id);

  const [data, labs] = await Promise.all([
    tenant.predictions.report({ courseId: course.id, groupIds }),
    tenant.labs.ofCourse(course.id),
  ]);
  const key = (row: { notebookId: string; cell: number }) => `${row.notebookId}#${row.cell}`;
  const topics = new Map<string, PredictionTopic[]>();
  for (const row of data.perTopic) {
    if (!(PREDICTION_TOPICS as readonly string[]).includes(row.topic)) continue;
    topics.set(key(row), [...(topics.get(key(row)) ?? []), row.topic as PredictionTopic]);
  }
  const picks = new Map<string, { pick: string; students: number }>();
  for (const row of data.wrong) {
    const k = `${key(row)}#${row.decision}`;
    const best = picks.get(k);
    const students = Number(row.students);
    if (!best || students > best.students || (students === best.students && row.pick < best.pick))
      picks.set(k, { pick: row.pick, students });
  }
  const hardest = new Map<string, HardDecision[]>();
  for (const row of data.perDecision) {
    const students = Number(row.students);
    if (students < MIN_STUDENTS) continue;
    const wrong = picks.get(`${key(row)}#${row.decision}`);
    const decision: HardDecision = {
      prompt: row.prompt,
      answer: row.answer,
      students,
      right: Number(row.right),
      // The wrong answer most of them gave: a count among five students or more, so it names nobody.
      wrong: wrong ?? null,
    };
    hardest.set(key(row), [...(hardest.get(key(row)) ?? []), decision]);
  }
  const byLab = new Map(labs.map((lab) => [lab.id, lab]));
  const embeds: EmbedUnderstanding[] = data.perEmbed
    .filter((row) => row.students >= MIN_STUDENTS && byLab.has(row.labId))
    .map((row) => {
      const lab = byLab.get(row.labId);
      return {
        labId: row.labId,
        lab: lab?.n ?? 0,
        labTitle: lab?.title ?? '',
        notebook: row.notebook,
        cell: row.cell,
        viz: row.viz ?? '',
        title: row.title,
        topics: topics.get(key(row)) ?? [],
        students: row.students,
        answers: Number(row.answers),
        right: Number(row.right),
        hardest: (hardest.get(key(row)) ?? [])
          .filter((d) => d.right < d.students)
          .sort((a, b) => a.right / a.students - b.right / b.students || b.students - a.students)
          .slice(0, 3),
      };
    })
    .sort((a, b) => a.lab - b.lab || a.notebook.localeCompare(b.notebook) || a.cell - b.cell);
  return c.json({ group, embeds } satisfies UnderstandingReport);
});

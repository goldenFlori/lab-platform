import { Alert } from '@heroui/react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ArrowLeft, BarChart3, FileBarChart, ShieldCheck } from 'lucide-react';
import type { ActivityReport } from '../../../../../../../shared/activity';
import { type Messages, t as messages, useT } from '../../../../../../i18n';
import { activityQuery } from '../../../../../../lib/activity';
import { ApiError } from '../../../../../../lib/api';
import { APP_NAME } from '../../../../../../lib/brand';
import { courseQuery } from '../../../../../../lib/courses';

// The course's activity for its staff (#18): how many students opened, downloaded and tried each
// lab, week by week. Only counts; no student is ever named here.

export const Route = createFileRoute('/_authed/o/$org/courses/$courseId/activity')({
  validateSearch: (search: Record<string, unknown>): { group?: string } => ({
    group: typeof search.group === 'string' ? search.group : undefined,
  }),
  loader: async ({ context, params }) => {
    try {
      const detail = await context.queryClient.ensureQueryData(courseQuery(params.org, params.courseId));
      if (!detail.permissions.analytics) throw notFound();
      return detail;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${messages().activity.title} · ${loaderData?.course.title ?? messages().course.pageTitle} · ${APP_NAME}`,
      },
    ],
  }),
  component: ActivityPage,
});

// Month names come from the messages rather than Intl: not every browser carries Albanian ones.

/** "5–11 tet", or "29 sht – 5 tet" across two months: the week from Monday to Sunday. */
function label(t: Messages, week: string) {
  const months = t.common.monthsShort;
  const monday = new Date(`${week}T00:00:00Z`);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const [m1, m2] = [months[monday.getUTCMonth()], months[sunday.getUTCMonth()]];
  return m1 === m2
    ? `${monday.getUTCDate()}–${sunday.getUTCDate()} ${m2}`
    : `${monday.getUTCDate()} ${m1} – ${sunday.getUTCDate()} ${m2}`;
}

/** The bar's short label: the Monday. */
const short = (t: Messages, week: string) => {
  const monday = new Date(`${week}T00:00:00Z`);
  return `${monday.getUTCDate()} ${t.common.monthsShort[monday.getUTCMonth()]}`;
};
const percent = (part: number, whole: number) => (whole ? Math.round((100 * part) / whole) : 0);

function ActivityPage() {
  const { org, courseId } = Route.useParams();
  const { group } = Route.useSearch();
  const { data: detail } = useSuspenseQuery(courseQuery(org, courseId));
  const report = useQuery(activityQuery(org, courseId, group));
  const t = useT();

  return (
    <section className="container-page py-10">
      <Link
        to="/o/$org/courses/$courseId"
        params={{ org, courseId }}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {detail.course.title}
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{t.activity.title}</h1>
        <Link
          to="/o/$org/courses/$courseId/report"
          params={{ org, courseId }}
          className="button button--secondary gap-2"
        >
          <FileBarChart className="size-4" /> {t.report.open}
        </Link>
      </div>
      <p className="mt-1 max-w-2xl text-muted">{t.activity.lead}</p>
      <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
        <ShieldCheck className="size-4" aria-hidden="true" /> {t.activity.privacy}
      </p>

      {report.isError ? (
        <Alert status="danger" className="mt-8">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t.activity.loadFailed}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : !report.data ? (
        <p className="mt-8 text-sm text-muted" aria-busy="true">
          {t.common.loading}
        </p>
      ) : (
        <Report report={report.data} org={org} courseId={courseId} />
      )}
    </section>
  );
}

function Report({ report, org, courseId }: { report: ActivityReport; org: string; courseId: string }) {
  const { students, weeks, labs, groups } = report;
  const [last, previous] = [weeks.at(-1), weeks.at(-2)];
  const quiet = weeks.every((w) => w.active === 0) && labs.every((l) => l.view === 0);
  const peak = Math.max(students, ...weeks.map((w) => w.active), 1);
  const t = useT();

  return (
    <>
      {groups.length > 1 && (
        <nav aria-label={t.activity.groups} className="mt-8 flex flex-wrap gap-2">
          {[{ id: undefined, name: t.activity.allGroups }, ...groups].map((g) => {
            const on = (report.group ?? undefined) === g.id;
            return (
              <Link
                key={g.id ?? 'all'}
                to="/o/$org/courses/$courseId/activity"
                params={{ org, courseId }}
                search={{ group: g.id }}
                aria-current={on ? 'page' : undefined}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  on
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-border bg-surface text-foreground/80 hover:border-accent/50'
                }`}
              >
                {g.name}
              </Link>
            );
          })}
        </nav>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label={t.activity.students} value={String(students)} />
        <Stat
          label={t.activity.activeThisWeek}
          value={String(last?.active ?? 0)}
          note={students ? t.activity.ofStudents(percent(last?.active ?? 0, students)) : undefined}
        />
        <Stat
          label={t.activity.activeLastWeek}
          value={String(previous?.active ?? 0)}
          note={students ? t.activity.ofStudents(percent(previous?.active ?? 0, students)) : undefined}
        />
      </dl>

      {students === 0 ? <Empty text={t.activity.noStudents} /> : quiet ? <Empty text={t.activity.quiet} /> : null}

      <div className="mt-10 rounded-3xl border border-border bg-surface p-5 shadow-surface sm:p-7">
        <h2 className="text-lg font-semibold tracking-tight">{t.activity.perWeek}</h2>
        <p className="mt-1 text-sm text-muted">{t.activity.perWeekHelp}</p>
        {/* The bars repeat the table below for the eye; screen readers get the table. */}
        <div className="mt-6 flex h-40 items-end gap-1.5 overflow-x-auto pb-1" aria-hidden="true">
          {weeks.map((w) => (
            <div key={w.week} className="flex h-full max-w-14 min-w-8 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[0.7rem] text-muted">{w.active || ''}</span>
              <div
                className="w-full rounded-t-md bg-accent"
                style={{
                  height: `${Math.max(w.active ? 4 : 1, (100 * w.active) / peak)}%`,
                  opacity: w.active ? 1 : 0.25,
                }}
                title={`${label(t, w.week)}: ${w.active}`}
              />
              <span className="text-[0.65rem] whitespace-nowrap text-muted">{short(t, w.week)}</span>
            </div>
          ))}
        </div>
        <details className="group mt-6">
          <summary className="cursor-pointer text-sm font-medium text-accent">{t.activity.showTable}</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-md text-left text-sm">
              <caption className="sr-only">{t.activity.perWeek}</caption>
              <thead className="text-xs text-muted">
                <tr className="border-b border-separator">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t.activity.week}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t.activity.active}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t.activity.opened}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t.activity.downloaded}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t.activity.triedViz}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    {t.activity.solved}
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...weeks].reverse().map((w) => (
                  <tr key={w.week} className="border-b border-separator/60 last:border-0">
                    <th scope="row" className="py-2 pr-4 font-medium">
                      {label(t, w.week)}
                    </th>
                    <td className="py-2 pr-4 tabular-nums">{w.active}</td>
                    <td className="py-2 pr-4 tabular-nums">{w.view}</td>
                    <td className="py-2 pr-4 tabular-nums">{w.download}</td>
                    <td className="py-2 pr-4 tabular-nums">{w.visualization}</td>
                    <td className="py-2 tabular-nums">{w.exercise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div className="mt-8 rounded-3xl border border-border bg-surface p-5 shadow-surface sm:p-7">
        <h2 className="text-lg font-semibold tracking-tight">{t.activity.perLab}</h2>
        <p className="mt-1 text-sm text-muted">{t.activity.perLabHelp(students)}</p>
        {labs.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t.activity.noLabs}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-md text-left text-sm">
              <caption className="sr-only">{t.activity.perLabCaption}</caption>
              <thead className="text-xs text-muted">
                <tr className="border-b border-separator">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t.activity.lab}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t.activity.opened}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t.activity.downloaded}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t.activity.triedViz}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    {t.activity.solved}
                  </th>
                </tr>
              </thead>
              <tbody>
                {labs.map((lab) => (
                  <tr key={lab.id} className="border-b border-separator/60 last:border-0">
                    <th scope="row" className="max-w-64 py-2.5 pr-4 font-medium">
                      <span className="text-muted">{lab.n}.</span> {lab.title}
                    </th>
                    <Share value={lab.view} of={students} />
                    <Share value={lab.download} of={students} />
                    <Share value={lab.visualization} of={students} />
                    <Share value={lab.exercise} of={students} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-3xl border border-border bg-surface p-5 shadow-surface">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-muted">{note}</dd>}
    </div>
  );
}

function Share({ value, of }: { value: number; of: number }) {
  const p = percent(value, of);
  return (
    <td className="py-2.5 pr-4 align-middle">
      <span className="tabular-nums">
        {value}
        <span className="text-muted"> / {of}</span>
      </span>
      <span className="mt-1 block h-1.5 w-24 overflow-hidden rounded-full bg-default" aria-hidden="true">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${p}%` }} />
      </span>
    </td>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="mt-8 grid place-items-center rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <BarChart3 className="size-8 text-muted" aria-hidden="true" />
      <p className="mt-3 max-w-sm text-sm text-muted">{text}</p>
    </div>
  );
}

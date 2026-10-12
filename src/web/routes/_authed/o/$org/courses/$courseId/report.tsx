import { Button } from '@heroui/react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ArrowLeft, Printer, ShieldCheck } from 'lucide-react';
import type { PilotCount, PilotReport } from '../../../../../../../shared/activity';
import { type Messages, t as messages, useT } from '../../../../../../i18n';
import { ApiError, api } from '../../../../../../lib/api';
import { APP_NAME } from '../../../../../../lib/brand';
import { courseQuery } from '../../../../../../lib/courses';

// The pilot report (#101): the numbers the Startup Albania application and the coordinator's
// letter ask for, over a period, as counts only. Fits two printed pages.

type Search = { from?: string; to?: string; group?: string };
const day = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);

export const Route = createFileRoute('/_authed/o/$org/courses/$courseId/report')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    from: day(search.from),
    to: day(search.to),
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
        title: `${messages().report.title} · ${loaderData?.course.title ?? messages().course.pageTitle} · ${APP_NAME}`,
      },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const { org, courseId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const t = useT();
  const { data: detail } = useSuspenseQuery(courseQuery(org, courseId));
  const query = new URLSearchParams(Object.entries(search).filter((e): e is [string, string] => Boolean(e[1])));
  const report = useQuery({
    queryKey: ['orgs', org, 'courses', courseId, 'report', search],
    queryFn: () =>
      api<PilotReport>(
        `/orgs/${encodeURIComponent(org)}/courses/${encodeURIComponent(courseId)}/report${query.size ? `?${query}` : ''}`,
      ),
  });
  const set = (change: Search) => void navigate({ search: (s) => ({ ...s, ...change }), replace: true });
  const data = report.data;

  return (
    <section className="container-page py-10 print:py-0">
      <Link
        to="/o/$org/courses/$courseId/activity"
        params={{ org, courseId }}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground print:hidden"
      >
        <ArrowLeft className="size-4" /> {t.activity.title}
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight print:mt-0">{t.report.title}</h1>
      <p className="mt-1 text-muted">
        {detail.course.title} · {t.course.academicYear(detail.course.academicYear)}
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3 print:hidden">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t.report.from}</span>
          <input
            type="date"
            value={data?.from ?? search.from ?? ''}
            onChange={(e) => set({ from: e.target.value || undefined })}
            className="h-10 rounded-xl border border-border bg-surface px-3"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t.report.to}</span>
          <input
            type="date"
            value={data?.to ?? search.to ?? ''}
            onChange={(e) => set({ to: e.target.value || undefined })}
            className="h-10 rounded-xl border border-border bg-surface px-3"
          />
        </label>
        {data && data.groups.length > 1 && (
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{t.activity.groups}</span>
            <select
              value={search.group ?? ''}
              onChange={(e) => set({ group: e.target.value || undefined })}
              className="h-10 rounded-xl border border-border bg-surface px-3"
            >
              <option value="">{t.activity.allGroups}</option>
              {data.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button variant="primary" onPress={() => window.print()}>
          <Printer className="size-4" /> {t.report.print}
        </Button>
      </div>

      {report.isError ? (
        <p className="mt-8 text-sm text-danger">{t.report.failed}</p>
      ) : !data ? (
        <p className="mt-8 text-sm text-muted">{t.common.loading}</p>
      ) : (
        <Report data={data} t={t} />
      )}
    </section>
  );
}

function Report({ data, t }: { data: PilotReport; t: Messages }) {
  const share = (n: number) => (data.students ? `${Math.round((100 * n) / data.students)}%` : '—');
  const weekly = data.weeks.length ? Math.round(data.weeks.reduce((n, w) => n + w.active, 0) / data.weeks.length) : 0;
  const peak = Math.max(1, ...data.weeks.map((w) => w.active));
  // Activity counts student-days (one a day each); the others count items.
  const counted = (label: string, count: PilotCount, days = false) => (
    <Stat
      label={label}
      value={String(count.total)}
      note={`${days ? `${t.report.studentDays} · ` : ''}${t.report.byStudents(count.students, share(count.students))}`}
    />
  );
  return (
    <div className="mt-6 grid gap-6" data-testid="pilot-report">
      <p className="text-sm">
        {t.report.period(data.from, data.to)}
        {data.group && ` · ${data.groups.find((g) => g.id === data.group)?.name ?? ''}`}
      </p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
        <Stat label={t.report.students} value={String(data.students)} />
        <Stat label={t.report.active} value={String(data.active)} note={share(data.active)} />
        <Stat label={t.report.weekly} value={String(weekly)} note={share(weekly)} />
        {counted(t.report.labsOpened, data.labsOpened, true)}
        {counted(t.report.codeRuns, data.codeRuns, true)}
        {counted(t.report.liveLabs, data.liveLabs, true)}
        {counted(t.report.visualizations, data.visualizations, true)}
        {counted(t.report.exercises, data.exercisesCompleted)}
        {counted(t.report.submissions, data.submissions)}
        {counted(t.report.aiQuestions, data.aiQuestions)}
        <Stat label={t.report.aiRequests} value={String(data.aiRequests)} />
      </dl>

      <section className="break-inside-avoid">
        <h2 className="font-semibold">{t.report.weeks}</h2>
        <ul className="mt-3 grid gap-1.5">
          {data.weeks.map((w) => (
            <li key={w.week} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm">
              <span className="text-muted tabular-nums">{w.week}</span>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-secondary print:border print:border-border">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(100 * w.active) / peak}%` }} />
              </div>
              <span className="text-right tabular-nums">{w.active}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="inline-flex items-center gap-2 text-xs text-muted">
        <ShieldCheck className="size-4 text-success" aria-hidden="true" />{' '}
        {t.report.privacy(new Date().toISOString().slice(0, 10))}
      </p>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="break-inside-avoid rounded-2xl border border-border bg-surface p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-muted">{note}</dd>}
    </div>
  );
}

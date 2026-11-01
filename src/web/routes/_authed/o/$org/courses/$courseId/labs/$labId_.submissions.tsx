import { Alert, Button } from '@heroui/react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ArrowLeft, ChevronDown, CircleCheck, Clock, Download, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { StoredNotebook } from '../../../../../../../../notebook/stored';
import type { Exercise } from '../../../../../../../../shared/exercises';
import type { ExerciseGrading, StaffGrade } from '../../../../../../../../shared/grading';
import { kolokiumEnd } from '../../../../../../../../shared/kolokium';
import type { Embed } from '../../../../../../../../shared/notebooks';
import type { KolokiumSetup, SubmissionList } from '../../../../../../../../shared/submissions';
import { HelpLink } from '../../../../../../../components/HelpLink';
import { AssessmentReport } from '../../../../../../../components/notebook/AssessmentReport';
import { GradeChip, GradeGroupBar, GradeReview, GradingSetup } from '../../../../../../../components/notebook/Grading';
import { t as messages, useT } from '../../../../../../../i18n';
import { ApiError } from '../../../../../../../lib/api';
import { APP_NAME } from '../../../../../../../lib/brand';
import { downloadCsv, fileSlug } from '../../../../../../../lib/csv';
import { gradesQuery, gradingSetupQuery } from '../../../../../../../lib/grading';
import { formatMoment, formatTime, labQuery } from '../../../../../../../lib/labs';
import { type NotebookRef, notebookQuery, notebooksQuery, renderedQuery } from '../../../../../../../lib/notebooks';
import { submissionDetailQuery, submissionListQuery } from '../../../../../../../lib/submissions';

// What a lab's students handed in (#52), for staff who review their groups: one group at a time,
// who handed in and when, and each one's code. Staff who grade also grade here (#53). Students
// never reach this page's data.

export const Route = createFileRoute('/_authed/o/$org/courses/$courseId/labs/$labId_/submissions')({
  validateSearch: (search: Record<string, unknown>): { notebook?: string; group?: string } => ({
    notebook: typeof search.notebook === 'string' ? search.notebook : undefined,
    group: typeof search.group === 'string' ? search.group : undefined,
  }),
  loader: async ({ context: { queryClient }, params: { org, courseId, labId } }) => {
    try {
      const [lab] = await Promise.all([
        queryClient.ensureQueryData(labQuery(org, courseId, labId)),
        queryClient.ensureQueryData(notebooksQuery(org, courseId, labId)),
      ]);
      return { title: lab.title };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${messages().submissions.pageTitle} · ${loaderData?.title ?? messages().lab.pageTitle} · ${APP_NAME}`,
      },
    ],
  }),
  component: SubmissionsPage,
});

function SubmissionsPage() {
  const { org, courseId, labId } = Route.useParams();
  const { notebook: chosen, group } = Route.useSearch();
  const { data: lab } = useSuspenseQuery(labQuery(org, courseId, labId));
  const { data: list } = useSuspenseQuery(notebooksQuery(org, courseId, labId));
  const t = useT();
  const ready = list.notebooks.filter((nb) => nb.ready && nb.kind !== 'solution');
  const current = ready.find((nb) => nb.id === chosen) ?? ready.find((nb) => nb.kind === 'main') ?? ready[0];
  const ref: NotebookRef = { org, courseId, labId, notebookId: current?.id ?? '' };
  const submissions = useQuery({
    ...submissionListQuery(ref, group),
    enabled: !!current,
    retry: false,
    // While a kolokium (#169) can still be started or handed in, staff watch it fill up.
    refetchInterval: (query) => {
      const data = query.state.data;
      const shown = data?.groups.find((g) => g.id === data.group);
      return shown?.kolokium && shown.dueAt && Date.now() < Date.parse(shown.dueAt) ? 15_000 : false;
    },
  });
  const detail = useQuery({ ...notebookQuery(ref), enabled: !!current });
  const rendered = useQuery({ ...renderedQuery(ref, current?.version ?? ''), enabled: !!current });
  // Staff who grade get the points and hidden tests; others are refused, and do not grade here.
  const setup = useQuery({ ...gradingSetupQuery(ref), enabled: !!current });
  const forbidden = submissions.error instanceof ApiError && submissions.error.status === 403;

  return (
    <section className="container-page py-10">
      <Link
        to="/o/$org/courses/$courseId/labs/$labId"
        params={{ org, courseId, labId }}
        search={current ? { notebook: current.id } : {}}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {lab.title}
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{t.submissions.pageTitle}</h1>
      {current && <p className="mt-1 max-w-2xl text-muted">{t.submissions.lead(current.title)}</p>}
      <HelpLink guide="grading" className="mt-2" />

      {ready.length > 1 && (
        <nav aria-label={t.lab.notebooks} className="mt-6 flex flex-wrap gap-2">
          {ready.map((nb) => (
            <Pill
              key={nb.id}
              on={nb.id === current?.id}
              label={nb.title}
              search={{ notebook: nb.id }}
              params={{ org, courseId, labId }}
            />
          ))}
        </nav>
      )}

      {!current ? (
        <p className="mt-8 text-sm text-muted">{t.submissions.noNotebook}</p>
      ) : forbidden ? (
        <Alert status="warning" className="mt-8">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t.submissions.forbidden}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : submissions.isError ? (
        <Alert status="danger" className="mt-8">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t.submissions.loadFailed}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : !submissions.data ? (
        <p className="mt-8 text-sm text-muted" aria-busy="true">
          {t.common.loading}
        </p>
      ) : (
        <Group
          data={submissions.data}
          notebookRef={ref}
          exercises={detail.data?.exercises ?? []}
          embeds={detail.data?.embeds ?? []}
          notebook={rendered.data}
          setup={setup.data?.exercises ?? null}
          title={current?.title ?? ''}
        />
      )}
    </section>
  );
}

function Pill({
  on,
  label,
  search,
  params,
}: {
  on: boolean;
  label: string;
  search: { notebook?: string; group?: string };
  params: { org: string; courseId: string; labId: string };
}) {
  return (
    <Link
      to="/o/$org/courses/$courseId/labs/$labId/submissions"
      params={params}
      search={(s) => ({ ...s, ...search })}
      aria-current={on ? 'page' : undefined}
      className={`max-w-full truncate rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
        on
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-border bg-surface text-foreground/80 hover:border-accent/50'
      }`}
    >
      {label}
    </Link>
  );
}

function Group({
  data,
  notebookRef,
  exercises,
  embeds,
  notebook,
  setup,
  title,
}: {
  data: SubmissionList;
  notebookRef: NotebookRef;
  exercises: Exercise[];
  embeds: Embed[];
  notebook: StoredNotebook | undefined;
  /** Points and hidden tests, for staff who grade (#53); null for staff who do not. */
  setup: ExerciseGrading[] | null;
  title: string;
}) {
  const t = useT();
  const grades = useQuery({ ...gradesQuery(notebookRef, data.group ?? ''), enabled: setup !== null && !!data.group });
  const gradeOf = new Map((grades.data?.grades ?? []).map((g) => [g.userId, g]));
  const { org, courseId, labId } = notebookRef;
  const shown = data.groups.find((g) => g.id === data.group);
  const handedIn = data.students.filter((s) => s.submission).length;

  // The group's grades for the institution's records (#114), released or not, with the trace
  // tables' share when the notebook has graded ones (#170).
  function downloadGrades() {
    const c = t.grading.csvColumns;
    const traced = [...gradeOf.values()].some((g) => g.traces.length > 0);
    const sum = (g: StaffGrade, key: 'score' | 'points') => g.traces.reduce((n, tr) => n + tr[key], 0);
    downloadCsv(t.grading.csvFile(fileSlug(`${title} ${shown?.name ?? ''}`)), [
      [c.username, c.fullName, c.score, c.maxScore, ...(traced ? [c.traces, c.tracesMax] : []), c.released, c.gradedAt],
      ...data.students.map((s) => {
        const g = gradeOf.get(s.id);
        return [
          s.username,
          s.fullName,
          g ? (g.score ?? g.autoScore) : null,
          g?.maxScore,
          ...(traced ? [g ? sum(g, 'score') : null, g ? sum(g, 'points') : null] : []),
          g ? (g.releasedAt ? c.yes : c.no) : null,
          g ? new Date(g.gradedAt).toLocaleDateString('sv-SE') : null,
        ];
      }),
    ]);
  }

  return (
    <>
      {data.groups.length > 1 && (
        <nav aria-label={t.submissions.group} className="mt-6 flex flex-wrap gap-2">
          {data.groups.map((g) => (
            <Pill
              key={g.id}
              on={g.id === data.group}
              label={g.name}
              search={{ group: g.id }}
              params={{ org, courseId, labId }}
            />
          ))}
        </nav>
      )}
      {setup && data.group && (
        <GradingSetup
          key={data.group}
          notebookRef={notebookRef}
          group={data.group}
          exercises={exercises}
          setup={setup}
        />
      )}
      <div className="mt-6 rounded-3xl border border-border bg-surface p-5 shadow-surface sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-semibold tracking-tight">{shown?.name}</h2>
          {data.students.length > 0 && (
            <p className="text-sm font-medium" data-testid="submission-count">
              {t.submissions.count(handedIn, data.students.length)}
            </p>
          )}
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <Clock className="size-4" aria-hidden="true" />
          {shown?.dueAt ? t.submissions.openUntil(formatMoment(shown.dueAt)) : t.submissions.noDeadline}
        </p>
        {shown?.kolokium && (
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
            <Timer className="size-4" aria-hidden="true" />
            {t.kolokium.setup(shown.kolokium.minutes, formatMoment(shown.kolokium.opensAt))}
            {shown.dueAt && Date.now() < Date.parse(shown.dueAt) && (
              <span className="text-xs">· {t.kolokium.refresh}</span>
            )}
          </p>
        )}
        {setup && data.group && handedIn > 0 && (
          <GradeGroupBar
            notebookRef={notebookRef}
            group={data.group}
            groupName={shown?.name ?? ''}
            notebook={notebook}
            exercises={exercises}
            setup={setup}
            graded={gradeOf.size}
          />
        )}
        {gradeOf.size > 0 && (
          <div className="mt-3">
            <Button size="sm" variant="tertiary" onPress={downloadGrades}>
              <Download className="size-4" /> {t.grading.csv}
            </Button>
          </div>
        )}
        {data.students.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t.submissions.noStudents}</p>
        ) : (
          <ul className="mt-4 divide-y divide-separator">
            {data.students.map((student) => (
              <Student
                key={student.id}
                student={student}
                notebookRef={notebookRef}
                exercises={exercises}
                notebook={notebook}
                kolokium={shown?.kolokium && shown.dueAt ? { ...shown.kolokium, dueAt: shown.dueAt } : null}
                grading={setup && data.group ? { group: data.group, grade: gradeOf.get(student.id) } : null}
              />
            ))}
          </ul>
        )}
      </div>
      {data.group && <AssessmentReport notebookRef={notebookRef} group={data.group} embeds={embeds} />}
    </>
  );
}

function Student({
  student,
  notebookRef,
  exercises,
  notebook,
  kolokium,
  grading,
}: {
  student: SubmissionList['students'][number];
  notebookRef: NotebookRef;
  exercises: Exercise[];
  notebook: StoredNotebook | undefined;
  /** The group's kolokium (#169), to say who started and who is still working. */
  kolokium: (KolokiumSetup & { dueAt: string }) | null;
  grading: { group: string; grade: StaffGrade | undefined } | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { submission } = student;
  return (
    <li className="py-3" data-testid="submission-row">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          <p className="truncate font-medium">{student.fullName}</p>
          <p className="truncate text-xs text-muted">{student.username}</p>
        </div>
        {submission ? (
          <div className="text-sm">
            <p className="flex items-center gap-1.5 text-success">
              <CircleCheck className="size-4" aria-hidden="true" /> {formatMoment(submission.submittedAt)}
              {submission.attempts > 1 && (
                <span className="text-xs text-muted">
                  · {submission.attempts} {t.submissions.attempts.toLowerCase()}
                </span>
              )}
            </p>
            {exercises.length > 0 && (
              <p className="text-xs text-muted">{t.submissions.solvedOf(submission.solved.length, exercises.length)}</p>
            )}
          </div>
        ) : kolokium ? (
          <KolokiumState startedAt={student.startedAt} kolokium={kolokium} />
        ) : (
          <p className="text-sm text-muted">{t.submissions.missing}</p>
        )}
        {submission && grading && <GradeChip grade={grading.grade} />}
        {submission && (
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-expanded={open}
            aria-label={t.submissions.read(student.fullName)}
            onPress={() => setOpen(!open)}
          >
            <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </Button>
        )}
      </div>
      {open && grading?.grade && (
        <GradeReview notebookRef={notebookRef} group={grading.group} grade={grading.grade} exercises={exercises} />
      )}
      {open && <SubmittedCode userId={student.id} notebookRef={notebookRef} notebook={notebook} />}
    </li>
  );
}

/** Where a student who has not handed in stands in the kolokium: not started, working, or out of time. */
function KolokiumState({
  startedAt,
  kolokium,
}: {
  startedAt: string | null;
  kolokium: KolokiumSetup & { dueAt: string };
}) {
  const t = useT();
  if (!startedAt) return <p className="text-sm text-muted">{t.kolokium.notStarted}</p>;
  const ends = kolokiumEnd(Date.parse(startedAt), kolokium.minutes, Date.parse(kolokium.dueAt));
  const time = (ms: number) => formatTime(new Date(ms).toISOString());
  return Date.now() < ends ? (
    <p className="flex items-center gap-1.5 text-sm text-accent">
      <Timer className="size-4" aria-hidden="true" /> {t.kolokium.working(time(ends))}
    </p>
  ) : (
    <div className="text-sm">
      <p className="text-muted">{t.submissions.missing}</p>
      <p className="text-xs text-muted">{t.kolokium.startedAt(time(Date.parse(startedAt)))}</p>
    </div>
  );
}

/** The student's code for the cells they changed, numbered as on the lab page. */
function SubmittedCode({
  userId,
  notebookRef,
  notebook,
}: {
  userId: string;
  notebookRef: NotebookRef;
  notebook: StoredNotebook | undefined;
}) {
  const t = useT();
  const query = useQuery(submissionDetailQuery(notebookRef, userId));
  const numbers = useMemo(() => {
    const map = new Map<number, number>();
    let n = 0;
    for (const cell of notebook?.cells ?? [])
      if (cell.type === 'code' && !map.has(cell.srcIndex)) map.set(cell.srcIndex, ++n);
    return map;
  }, [notebook]);
  if (query.isError) return <p className="mt-3 text-sm text-danger">{t.submissions.loadFailed}</p>;
  if (!query.data) {
    return (
      <p className="mt-3 text-sm text-muted" aria-busy="true">
        {t.common.loading}
      </p>
    );
  }
  const { code } = query.data;
  return (
    <section aria-label={t.submissions.detailTitle(query.data.fullName)} className="mt-3 grid gap-3">
      {code.length === 0 ? (
        <p className="text-sm text-muted">{t.submissions.unchanged}</p>
      ) : (
        code.map((cell) => (
          <figure
            key={cell.cell}
            className="overflow-hidden rounded-xl border border-[var(--code-border)] bg-[var(--code-bg)]"
          >
            <figcaption className="border-b border-[var(--code-border)] px-3 py-1.5 font-mono text-xs text-muted">
              {t.submissions.cell(numbers.get(cell.cell) ?? cell.cell + 1)}
            </figcaption>
            <pre className="overflow-x-auto px-3 py-2 font-mono text-[0.8rem] leading-relaxed">{cell.code}</pre>
          </figure>
        ))
      )}
    </section>
  );
}

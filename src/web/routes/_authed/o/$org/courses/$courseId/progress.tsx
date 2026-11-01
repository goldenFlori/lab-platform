import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import {
  ArrowLeft,
  BrainCircuit,
  CircleCheck,
  Clock,
  Lightbulb,
  MessageSquare,
  Repeat,
  Send,
  Star,
} from 'lucide-react';
import type { TopicResult } from '../../../../../../../shared/predictions';
import type { LabProgress, NotebookProgress } from '../../../../../../../shared/progress';
import { RichText } from '../../../../../../../viz/kit/RichText';
import { t as messages, useT } from '../../../../../../i18n';
import { aiStatusQuery } from '../../../../../../lib/ai';
import { ApiError } from '../../../../../../lib/api';
import { APP_NAME } from '../../../../../../lib/brand';
import { courseQuery } from '../../../../../../lib/courses';
import { formatMoment } from '../../../../../../lib/labs';
import { progressQuery } from '../../../../../../lib/progress';

// "My progress" (#99): a student's own course at a glance — the labs they opened, the exercises
// they solved, what they handed in and the grades released to them.

export const Route = createFileRoute('/_authed/o/$org/courses/$courseId/progress')({
  loader: async ({ context, params }) => {
    try {
      const [detail] = await Promise.all([
        context.queryClient.ensureQueryData(courseQuery(params.org, params.courseId)),
        context.queryClient.ensureQueryData(progressQuery(params.org, params.courseId)),
      ]);
      return detail;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${messages().progress.title} · ${loaderData?.course.title ?? messages().course.pageTitle} · ${APP_NAME}`,
      },
    ],
  }),
  component: ProgressPage,
});

function ProgressPage() {
  const { org, courseId } = Route.useParams();
  const t = useT();
  const { data: detail } = useSuspenseQuery(courseQuery(org, courseId));
  const { data } = useSuspenseQuery(progressQuery(org, courseId));
  const ai = useQuery({ ...aiStatusQuery(org, courseId), enabled: detail.course.ai });
  const notebooks = data.labs.flatMap((lab) => lab.notebooks);
  const totals = {
    opened: data.labs.filter((lab) => lab.opened).length,
    solved: notebooks.reduce((n, nb) => n + nb.solved, 0),
    exercises: notebooks.reduce((n, nb) => n + nb.exercises, 0),
    assigned: notebooks.filter((nb) => nb.dueAt).length,
    handedIn: notebooks.filter((nb) => nb.dueAt && nb.submittedAt).length,
    grades: notebooks.filter((nb) => nb.grade).length,
  };

  return (
    <section className="container-page py-10">
      <Link
        to="/o/$org/courses/$courseId"
        params={{ org, courseId }}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {detail.course.title}
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{t.progress.title}</h1>
      <p className="mt-1 text-muted">{t.progress.lead}</p>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="progress-totals">
        <Stat label={t.progress.labsOpened} value={`${totals.opened}/${data.labs.length}`} />
        <Stat label={t.progress.exercisesSolved} value={`${totals.solved}/${totals.exercises}`} />
        <Stat label={t.progress.handedIn} value={`${totals.handedIn}/${totals.assigned}`} />
        <Stat label={t.progress.grades} value={String(totals.grades)} />
      </dl>
      {ai.data?.enabled && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
          <Lightbulb className="size-4 text-accent" aria-hidden="true" /> {t.progress.aiLeft(ai.data.left)}
        </p>
      )}

      <Understanding org={org} courseId={courseId} topics={data.topics} />

      {data.labs.length === 0 ? (
        <p className="mt-8 text-sm text-muted">{t.progress.noLabs}</p>
      ) : (
        <ul className="mt-8 grid gap-4">
          {data.labs.map((lab) => (
            <li key={lab.id}>
              <LabCard org={org} courseId={courseId} lab={lab} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** First-try results per topic (#151), and the one to review: the lowest, once it has three answers. */
function Understanding({ org, courseId, topics }: { org: string; courseId: string; topics: TopicResult[] }) {
  const t = useT();
  const weakest = topics
    .filter((r) => r.asked >= 3 && r.right < r.asked)
    .sort((a, b) => a.right / a.asked - b.right / b.asked)[0];
  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface p-4 sm:p-5" data-testid="understanding">
      <h2 className="flex items-center gap-2 font-semibold">
        <BrainCircuit className="size-5 text-accent" aria-hidden="true" /> {t.progress.understanding.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{t.progress.understanding.lead}</p>
      {topics.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t.progress.understanding.empty}</p>
      ) : (
        <>
          <ul className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {topics.map((r) => (
              <li key={r.topic} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{t.topics[r.topic]}</span>
                  <span className="text-xs text-muted tabular-nums">
                    {t.progress.understanding.right(r.right, r.asked)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-secondary" aria-hidden="true">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(100 * r.right) / r.asked}%`,
                      background: r.right / r.asked >= 0.7 ? 'var(--state-done)' : 'var(--state-frontier)',
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
          {weakest && (
            <p className="mt-4 text-sm">
              <RichText text={t.progress.understanding.review(t.topics[weakest.topic])} />
            </p>
          )}
          <Link
            to="/o/$org/courses/$courseId/review"
            params={{ org, courseId }}
            className="button button--secondary mt-4 gap-2"
          >
            <Repeat className="size-4" /> {t.review.open}
          </Link>
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function LabCard({ org, courseId, lab }: { org: string; courseId: string; lab: LabProgress }) {
  const t = useT();
  return (
    <article className="rounded-2xl border border-border bg-surface p-4" data-testid="progress-lab">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">
          <Link
            to="/o/$org/courses/$courseId/labs/$labId"
            params={{ org, courseId, labId: lab.id }}
            className="hover:text-accent"
          >
            {t.progress.lab(lab.n, lab.title)}
          </Link>
        </h2>
        <span className={`text-xs ${lab.opened ? 'text-success' : 'text-muted'}`}>
          {lab.opened ? t.progress.opened : t.progress.notOpened}
        </span>
      </div>
      {lab.notebooks.length > 0 && (
        <ul className="mt-3 divide-y divide-separator">
          {lab.notebooks.map((nb) => (
            <NotebookRow key={nb.id} nb={nb} />
          ))}
        </ul>
      )}
    </article>
  );
}

function NotebookRow({ nb }: { nb: NotebookProgress }) {
  const t = useT();
  const late = nb.dueAt !== null && !nb.submittedAt && new Date(nb.dueAt).getTime() < Date.now();
  return (
    <li className="grid gap-2 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="font-medium">{nb.title}</p>
        {nb.exercises > 0 && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-surface-secondary">
              <div
                className="h-full rounded-full bg-success"
                style={{ width: `${(100 * nb.solved) / nb.exercises}%` }}
              />
            </div>
            <span className="text-xs text-muted">
              <CircleCheck className="mr-1 inline size-3.5" aria-hidden="true" />
              {t.progress.solved(nb.solved, nb.exercises)}
            </span>
          </div>
        )}
      </div>
      <div className="grid gap-1 text-xs sm:text-right">
        {nb.submittedAt ? (
          <span className="text-success">
            <Send className="mr-1 inline size-3.5" aria-hidden="true" />
            {t.progress.submitted(formatMoment(nb.submittedAt))}
          </span>
        ) : nb.dueAt ? (
          <span className={late ? 'text-danger' : 'text-warning'}>
            <Clock className="mr-1 inline size-3.5" aria-hidden="true" />
            {late ? t.progress.missed(formatMoment(nb.dueAt)) : t.progress.due(formatMoment(nb.dueAt))}
          </span>
        ) : null}
        {nb.grade && (
          <span className="font-semibold" data-testid="progress-grade">
            <Star className="mr-1 inline size-3.5 text-warning" aria-hidden="true" />
            {t.progress.grade(nb.grade.score, nb.grade.maxScore)}
          </span>
        )}
        {nb.grade?.feedback && <span className="text-muted sm:max-w-64">{nb.grade.feedback}</span>}
        {/* Comments beside the code (#220): read under their cells on the lab page. */}
        {nb.grade && nb.grade.comments.length > 0 && (
          <span className="text-accent" data-testid="progress-comments">
            <MessageSquare className="mr-1 inline size-3.5" aria-hidden="true" />
            {t.comments.count(nb.grade.comments.length)}
          </span>
        )}
      </div>
    </li>
  );
}

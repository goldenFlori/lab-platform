import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Repeat } from 'lucide-react';
import { lazy, Suspense } from 'react';
import type { PredictionTopic, TopicResult } from '../../../../../../../shared/predictions';
import type { ReviewTopic } from '../../../../../../../shared/review';
import { VizPlaceholder } from '../../../../../../components/VizEmbed';
import { t as messages, useT } from '../../../../../../i18n';
import { ApiError } from '../../../../../../lib/api';
import { APP_NAME } from '../../../../../../lib/brand';
import { courseQuery } from '../../../../../../lib/courses';
import { reviewQuery } from '../../../../../../lib/progress';

// The review session (#152): mixed practice from the labs a student has opened. The questions are
// made in the browser on fresh inputs; this page brings the plan, and remembers this device's
// answers so the weak topics come back sooner next time too.

const ReviewSession = lazy(() => import('../../../../../../../viz/ReviewSession'));

export const Route = createFileRoute('/_authed/o/$org/courses/$courseId/review')({
  loader: async ({ context, params }) => {
    try {
      const [detail] = await Promise.all([
        context.queryClient.ensureQueryData(courseQuery(params.org, params.courseId)),
        context.queryClient.ensureQueryData(reviewQuery(params.org, params.courseId)),
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
        title: `${messages().review.title} · ${loaderData?.course.title ?? messages().course.pageTitle} · ${APP_NAME}`,
      },
    ],
  }),
  component: ReviewPage,
});

const storageKey = (courseId: string) => `review:${courseId}`;

/** This device's review answers per topic: a convenience, so it may be missing at any time. */
function remembered(courseId: string): TopicResult[] {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(courseId)) ?? '{}') as Record<string, [number, number]>;
    return Object.entries(raw).map(([topic, [asked, right]]) => ({ topic: topic as PredictionTopic, asked, right }));
  } catch {
    return [];
  }
}

function remember(courseId: string, topic: ReviewTopic, right: boolean) {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(courseId)) ?? '{}') as Record<string, [number, number]>;
    const [asked, ok] = raw[topic] ?? [0, 0];
    raw[topic] = [asked + 1, ok + (right ? 1 : 0)];
    localStorage.setItem(storageKey(courseId), JSON.stringify(raw));
  } catch {
    // Storage is blocked: the session still works, it just will not remember.
  }
}

function ReviewPage() {
  const { org, courseId } = Route.useParams();
  const t = useT();
  const { data: detail } = useSuspenseQuery(courseQuery(org, courseId));
  const { data: plan } = useSuspenseQuery(reviewQuery(org, courseId));
  const labOf = new Map(plan.topics.map((x) => [x.topic, x]));

  return (
    <section className="container-page py-10">
      <Link
        to="/o/$org/courses/$courseId"
        params={{ org, courseId }}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {detail.course.title}
      </Link>
      <h1 className="mt-4 flex items-center gap-2 text-3xl font-bold tracking-tight">
        <Repeat className="size-7 text-accent" aria-hidden="true" /> {t.review.title}
      </h1>
      <p className="mt-1 max-w-2xl text-muted">{t.review.lead}</p>
      <div className="mt-6">
        {plan.topics.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted">
            {t.review.empty}
          </p>
        ) : (
          <Suspense fallback={<VizPlaceholder />}>
            <ReviewSession
              topics={plan.topics.map((x) => x.topic)}
              results={[...plan.results, ...remembered(courseId)]}
              topicName={(topic) => t.topics[topic]}
              onAnswer={(topic, right) => remember(courseId, topic, right)}
              labLink={(topic) => {
                const lab = labOf.get(topic);
                return lab ? (
                  <Link
                    to="/o/$org/courses/$courseId/labs/$labId"
                    params={{ org, courseId, labId: lab.labId }}
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    {t.review.toLab(lab.lab)} <ArrowRight className="size-3.5" />
                  </Link>
                ) : null;
              }}
            />
          </Suspense>
        )}
      </div>
    </section>
  );
}

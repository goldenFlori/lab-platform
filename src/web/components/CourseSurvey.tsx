import { Alert, Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, MessageSquareQuote } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { SURVEY_MIN_ANSWERS, SURVEY_QUESTIONS, type SurveyQuestion } from '../../shared/survey-questions';
import type { SurveyResults } from '../../shared/surveys';
import { useT } from '../i18n';
import { formatMoment, fromLocalInput, toLocalInput } from '../lib/labs';
import { surveyQuery, useSurveyChanges } from '../lib/surveys';

// The end-of-semester survey (#102) on the course page: students answer it once, anonymously;
// staff who manage the course open it until a date and, with five answers or more, read the totals.

export function SurveyForStudent({ org, courseId }: { org: string; courseId: string }) {
  const t = useT();
  const { data } = useQuery(surveyQuery(org, courseId));
  const changes = useSurveyChanges(org, courseId);
  const [ratings, setRatings] = useState<Partial<Record<SurveyQuestion, number>>>({});
  const [comment, setComment] = useState('');
  if (changes.answer.isSuccess) {
    return (
      <Alert status="success" className="mt-6">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{t.survey.thanks}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  if (!data?.canAnswer || !data.survey) return null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    changes.answer.mutate({ ratings, comment: comment.trim() || undefined });
  };
  return (
    <form
      onSubmit={submit}
      className="mt-6 rounded-2xl border border-accent/40 bg-accent-soft/30 p-5"
      data-testid="survey-form"
    >
      <h2 className="flex items-center gap-2 font-semibold">
        <ClipboardList className="size-5 text-accent" aria-hidden="true" /> {t.survey.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{t.survey.lead(formatMoment(data.survey.closesAt))}</p>
      <div className="mt-4 grid gap-4">
        {SURVEY_QUESTIONS.map((question) => (
          <fieldset key={question}>
            <legend className="text-sm font-medium">{t.survey.questions[question]}</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  key={score}
                  type="button"
                  aria-pressed={ratings[question] === score}
                  aria-label={t.survey.score(score)}
                  onClick={() => setRatings((r) => ({ ...r, [question]: score }))}
                  className={`size-10 rounded-xl border text-sm font-semibold ${
                    ratings[question] === score
                      ? 'border-accent bg-accent text-accent-foreground'
                      : 'border-border bg-surface'
                  }`}
                >
                  {score}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={ratings[question] === undefined}
                onClick={() => setRatings(({ [question]: _, ...rest }) => rest)}
                className={`h-10 rounded-xl border px-3 text-xs ${
                  ratings[question] === undefined ? 'border-accent bg-accent-soft' : 'border-border bg-surface'
                }`}
              >
                {t.survey.didNotUse}
              </button>
            </div>
          </fieldset>
        ))}
        <p className="text-xs text-muted">{t.survey.scale}</p>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t.survey.comment}</span>
          <textarea
            value={comment}
            maxLength={1000}
            rows={3}
            onChange={(e) => setComment(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2"
          />
        </label>
      </div>
      {changes.answer.isError && <p className="mt-2 text-sm text-danger">{t.survey.failed}</p>}
      <Button type="submit" variant="primary" className="mt-4" isPending={changes.answer.isPending}>
        {t.survey.send}
      </Button>
    </form>
  );
}

export function SurveyForStaff({ org, courseId, canManage }: { org: string; courseId: string; canManage: boolean }) {
  const t = useT();
  const { data } = useQuery(surveyQuery(org, courseId));
  const changes = useSurveyChanges(org, courseId);
  const [closesAt, setClosesAt] = useState(() => toLocalInput(new Date(Date.now() + 14 * 86_400_000).toISOString()));
  if (!data || (!data.results && !canManage)) return null;
  const { survey, results } = data;
  return (
    <section className="mt-10" data-testid="survey-staff">
      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <ClipboardList className="size-5 text-accent" aria-hidden="true" /> {t.survey.staffTitle}
      </h2>
      <p className="mt-1 text-sm text-muted">{t.survey.staffLead(SURVEY_MIN_ANSWERS)}</p>
      {canManage && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{survey ? t.survey.closes : t.survey.openUntil}</span>
            <input
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className="h-10 rounded-xl border border-border bg-surface px-3"
            />
          </label>
          <Button
            variant={survey ? 'secondary' : 'primary'}
            isPending={changes.open.isPending}
            isDisabled={!closesAt}
            onPress={() => {
              const iso = fromLocalInput(closesAt);
              if (iso) changes.open.mutate(iso);
            }}
          >
            {survey ? t.survey.move : t.survey.open}
          </Button>
          {survey?.open && (
            <Button variant="ghost" onPress={() => changes.open.mutate(new Date().toISOString())}>
              {t.survey.closeNow}
            </Button>
          )}
        </div>
      )}
      {survey && (
        <p className="mt-3 text-sm">
          {survey.open
            ? t.survey.openState(formatMoment(survey.closesAt))
            : t.survey.closedState(formatMoment(survey.closesAt))}
        </p>
      )}
      {results && <SurveyResultsView results={results} />}
    </section>
  );
}

export function SurveyResultsView({ results }: { results: SurveyResults }) {
  const t = useT();
  return (
    <div className="mt-4 grid gap-4 rounded-2xl border border-border bg-surface p-4" data-testid="survey-results">
      <p className="text-sm font-medium">{t.survey.answered(results.respondents, results.students)}</p>
      {!results.enough ? (
        <p className="text-sm text-muted">{t.survey.notEnough(SURVEY_MIN_ANSWERS)}</p>
      ) : (
        <>
          <ul className="grid gap-3">
            {results.questions.map((q) => (
              <li key={q.question} className="grid gap-1 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span>{t.survey.questions[q.question]}</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {q.average === null ? '—' : `${q.average.toFixed(1)} / 5`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-secondary print:border print:border-border">
                  <div
                    className="h-full rounded-full bg-success"
                    style={{ width: `${((q.average ?? 0) / 5) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-muted">{t.survey.ratedBy(q.answers)}</span>
              </li>
            ))}
          </ul>
          {results.comments.length > 0 && (
            <div className="break-inside-avoid">
              <p className="flex items-center gap-2 text-sm font-medium">
                <MessageSquareQuote className="size-4 text-accent" aria-hidden="true" /> {t.survey.comments}
              </p>
              <ul className="mt-2 grid gap-2">
                {results.comments.map((comment) => (
                  <li key={comment} className="rounded-xl bg-surface-secondary px-3 py-2 text-sm">
                    {comment}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

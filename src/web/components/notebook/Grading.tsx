import { Alert, AlertDialog, Button } from '@heroui/react';
import { Gauge, Megaphone, Play } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { StoredNotebook } from '../../../notebook/stored';
import { MAX_TEST } from '../../../shared/exercise-limits';
import type { Exercise } from '../../../shared/exercises';
import type { ExerciseGrading, StaffGrade } from '../../../shared/grading';
import { useT } from '../../i18n';
import { gradeGroup, useGradingChanges } from '../../lib/grading';
import type { NotebookRef } from '../../lib/notebooks';

// Grading on the pedagog's machine (#53): points and hidden tests per exercise, the batch run over
// a group's submissions, release, and each student's adjustment.

/** Points and hidden tests, for staff who grade. */
export function GradingSetup({
  notebookRef,
  group,
  exercises,
  setup,
}: {
  notebookRef: NotebookRef;
  group: string;
  exercises: Exercise[];
  setup: ExerciseGrading[];
}) {
  const t = useT();
  const changes = useGradingChanges(notebookRef, group);
  const [status, setStatus] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const saved = new Map(setup.map((s) => [s.cell, s]));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const list = exercises.map((e) => {
      const test = String(form.get(`hidden-${e.cell}`) ?? '');
      return {
        cell: e.cell,
        points: Math.max(0, Math.round(Number(form.get(`points-${e.cell}`)) || 0)),
        hiddenTest: test.trim() ? test : null,
      };
    });
    try {
      await changes.saveSetup.mutateAsync(list);
      setStatus({ tone: 'success', text: t.grading.setupSaved });
    } catch {
      setStatus({ tone: 'danger', text: t.grading.setupFailed });
    }
  }

  return (
    <details className="group mt-6 rounded-2xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
        <Gauge className="size-4 shrink-0 text-accent" aria-hidden="true" />
        <span className="flex-1 text-sm font-semibold">{t.grading.setupTitle}</span>
      </summary>
      <form onSubmit={submit} aria-label={t.grading.setupTitle} className="border-t border-border p-4">
        <p className="text-sm text-muted">{t.grading.setupHelp}</p>
        {exercises.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t.grading.noExercises}</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {exercises.map((e) => (
              <li key={e.cell}>
                <fieldset className="grid gap-3 rounded-xl bg-surface-secondary p-3 sm:grid-cols-[8rem_1fr]">
                  <legend className="mb-1 text-sm font-semibold">{e.title}</legend>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">{t.grading.points}</span>
                    <input
                      type="number"
                      name={`points-${e.cell}`}
                      min={0}
                      max={1000}
                      defaultValue={saved.get(e.cell)?.points ?? 1}
                      className="h-10 rounded-xl border border-border bg-surface px-3"
                    />
                  </label>
                  <label className="grid min-w-0 gap-1 text-sm">
                    <span className="font-medium">{t.grading.hidden}</span>
                    <textarea
                      name={`hidden-${e.cell}`}
                      rows={2}
                      maxLength={MAX_TEST}
                      spellCheck={false}
                      defaultValue={saved.get(e.cell)?.hiddenTest ?? ''}
                      className="rounded-xl border border-border bg-surface px-3 py-2 font-mono text-[0.85rem]"
                    />
                  </label>
                </fieldset>
              </li>
            ))}
          </ul>
        )}
        {status && (
          <Alert status={status.tone} className="mt-4">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{status.text}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        {exercises.length > 0 && (
          <Button type="submit" size="sm" variant="primary" className="mt-4" isPending={changes.saveSetup.isPending}>
            {t.grading.saveSetup}
          </Button>
        )}
      </form>
    </details>
  );
}

/** Grade the whole group in this browser, then release. */
export function GradeGroupBar({
  notebookRef,
  group,
  groupName,
  notebook,
  exercises,
  setup,
  graded,
}: {
  notebookRef: NotebookRef;
  group: string;
  groupName: string;
  notebook: StoredNotebook | undefined;
  exercises: Exercise[];
  setup: ExerciseGrading[];
  graded: number;
}) {
  const t = useT();
  const changes = useGradingChanges(notebookRef, group);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const running = progress !== null && message === null;

  async function run() {
    if (!notebook) return;
    setMessage(null);
    setProgress({ done: 0, total: 0 });
    try {
      let total = 0;
      await gradeGroup(notebookRef, group, notebook, exercises, setup, (done, of) => {
        total = of;
        setProgress({ done, total: of });
      });
      setMessage({ tone: 'success', text: t.grading.finished(total) });
    } catch {
      setMessage({ tone: 'danger', text: t.grading.runFailed });
    }
    await changes.refreshGrades();
  }

  return (
    <div className="mt-4 rounded-xl bg-surface-secondary p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          onPress={() => void run()}
          isPending={running}
          isDisabled={!notebook || exercises.length === 0}
        >
          <Play className="size-4" /> {t.grading.run(groupName)}
        </Button>
        {graded > 0 && (
          <AlertDialog>
            <Button size="sm" variant="secondary" isDisabled={running}>
              <Megaphone className="size-4" /> {t.grading.release}
            </Button>
            <AlertDialog.Backdrop>
              <AlertDialog.Container>
                <AlertDialog.Dialog>
                  <AlertDialog.Header>
                    <AlertDialog.Icon status="accent" />
                    <AlertDialog.Heading>{t.grading.releaseTitle}</AlertDialog.Heading>
                  </AlertDialog.Header>
                  <AlertDialog.Body>{t.grading.releaseText}</AlertDialog.Body>
                  <AlertDialog.Footer>
                    <Button slot="close" variant="tertiary">
                      {t.common.cancel}
                    </Button>
                    <Button slot="close" variant="primary" onPress={() => changes.release.mutate()}>
                      {t.grading.release}
                    </Button>
                  </AlertDialog.Footer>
                </AlertDialog.Dialog>
              </AlertDialog.Container>
            </AlertDialog.Backdrop>
          </AlertDialog>
        )}
      </div>
      <p className="mt-2 text-xs text-muted" aria-live="polite">
        {running && progress ? t.grading.progress(progress.done, progress.total) : t.grading.runHelp}
      </p>
      {message && (
        <p role="status" className={`mt-1 text-sm ${message.tone === 'danger' ? 'text-danger' : 'text-success'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

/** A student's grade in the list: the score, and whether it is released. */
export function GradeChip({ grade }: { grade: StaffGrade | undefined }) {
  const t = useT();
  if (!grade) return <span className="text-xs text-muted">{t.grading.notGraded}</span>;
  return (
    <span className="flex items-center gap-1.5 text-sm" data-testid="grade">
      <span className="font-semibold tabular-nums">
        {t.grading.grade(grade.score ?? grade.autoScore, grade.maxScore)}
      </span>
      <span className={`text-xs ${grade.releasedAt ? 'text-success' : 'text-muted'}`}>
        {grade.releasedAt ? t.grading.released : t.grading.notReleased}
      </span>
    </span>
  );
}

/** The pedagog's adjustment of one student's grade, and feedback. */
export function GradeReview({
  notebookRef,
  group,
  grade,
  exercises,
}: {
  notebookRef: NotebookRef;
  group: string;
  grade: StaffGrade;
  exercises: Exercise[];
}) {
  const t = useT();
  const changes = useGradingChanges(notebookRef, group);
  const [message, setMessage] = useState<string | null>(null);
  const titles = new Map(exercises.map((e) => [e.cell, e.title]));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = String(form.get('score') ?? '').trim();
    const feedback = String(form.get('feedback') ?? '').trim();
    try {
      await changes.review.mutateAsync({
        userId: grade.userId,
        score: raw === '' ? null : Math.max(0, Math.round(Number(raw))),
        feedback: feedback || null,
      });
      setMessage(t.grading.reviewSaved);
    } catch {
      setMessage(t.grading.reviewFailed);
    }
  }

  return (
    <form onSubmit={save} aria-label={t.grading.score} className="mt-3 grid gap-3 rounded-xl bg-surface-secondary p-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {grade.results.map((r) => (
          <li key={r.cell} className={r.status === 'pass' ? 'text-success' : 'text-danger'}>
            {t.grading.status[r.status]} {titles.get(r.cell) ?? r.cell}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{t.grading.auto(grade.autoScore, grade.maxScore)}</p>
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t.grading.score}</span>
          <input
            type="number"
            name="score"
            min={0}
            defaultValue={grade.score ?? ''}
            placeholder={String(grade.autoScore)}
            className="h-10 rounded-xl border border-border bg-surface px-3"
          />
          <span className="text-xs text-muted">{t.grading.scoreHelp}</span>
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          <span className="font-medium">{t.grading.feedback}</span>
          <textarea
            name="feedback"
            rows={2}
            maxLength={4000}
            defaultValue={grade.feedback ?? ''}
            className="rounded-xl border border-border bg-surface px-3 py-2"
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="primary" isPending={changes.review.isPending}>
          {t.grading.saveReview}
        </Button>
        {message && (
          <span role="status" className="text-sm text-muted">
            {message}
          </span>
        )}
      </div>
    </form>
  );
}

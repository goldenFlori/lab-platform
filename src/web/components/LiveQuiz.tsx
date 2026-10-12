import { Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleHelp, Sparkles } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { QUIZ_LIMITS } from '../../shared/live';
import { useT } from '../i18n';
import { aiErrorText, aiPath, aiStatusQuery, streamAi } from '../lib/ai';
import type { QuizState } from '../lib/live';
import { sectionInView, useLive } from '../lib/live-context';
import { parseQuiz, type QuizDraft } from '../lib/quiz';

// Quick questions in a Live Lab (#87). The host writes one, or takes one of the copilot's drafts
// from the section on screen, and launches it; students answer once on their phones; the staff see
// the counts as they come and the host reveals the right answer to everyone.

const LETTERS = ['A', 'B', 'C', 'D'];

/** For the host and assistants: the running question and its counts, or (host) a new one. */
export function QuizStaff({ org, courseId }: { org: string; courseId: string }) {
  const t = useT();
  const live = useLive();
  const [composing, setComposing] = useState(false);
  if (!live) return null;
  const running = live.socket.quiz;
  if (running) return <QuizResults state={running} host={live.isHost} />;
  if (!live.isHost) return null;
  return composing ? (
    <QuizComposer org={org} courseId={courseId} onDone={() => setComposing(false)} />
  ) : (
    <div className="mt-3">
      <Button size="sm" variant="secondary" onPress={() => setComposing(true)}>
        <CircleHelp className="size-4" /> {t.quiz.open}
      </Button>
    </div>
  );
}

function QuizComposer({ org, courseId, onDone }: { org: string; courseId: string; onDone: () => void }) {
  const t = useT();
  const live = useLive();
  const ai = useQuery(aiStatusQuery(org, courseId));
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [drafts, setDrafts] = useState<QuizDraft[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const use = (draft: QuizDraft) => {
    setQuestion(draft.question);
    setOptions(LETTERS.map((_, i) => draft.options[i] ?? ''));
    setCorrect(draft.correct);
  };

  async function draft() {
    const part = sectionInView();
    if (!part.text) return setError(t.quiz.nothingInView);
    setError(null);
    setDrafts([]);
    setDrafting(true);
    try {
      await streamAi(`${aiPath(org, courseId)}/quiz`, { title: part.title, context: part.text }, (text) =>
        setDrafts(parseQuiz(text)),
      );
    } catch (reason) {
      setError(aiErrorText(t, reason));
    } finally {
      setDrafting(false);
    }
  }

  function launch(event: FormEvent) {
    event.preventDefault();
    const filled = options.map((o, i) => ({ text: o.trim(), i })).filter((o) => o.text);
    const at = filled.findIndex((o) => o.i === correct);
    if (!question.trim() || filled.length < QUIZ_LIMITS.minOptions || at < 0) return setError(t.quiz.incomplete);
    live?.startQuiz(
      question.trim(),
      filled.map((o) => o.text),
      at,
    );
    onDone();
  }

  const field = 'w-full min-w-0 rounded-xl border border-border bg-surface px-3';
  return (
    <form
      onSubmit={launch}
      aria-label={t.quiz.title}
      className="mt-4 grid gap-3 rounded-xl bg-surface p-3"
      data-testid="quiz-composer"
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CircleHelp className="size-4 text-accent" aria-hidden="true" /> {t.quiz.title}
      </p>
      {ai.data?.enabled && (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onPress={draft} isPending={drafting} isDisabled={ai.data.left === 0}>
              <Sparkles className="size-4" /> {t.quiz.draft}
            </Button>
            <span className="text-xs text-muted">{t.quiz.draftHelp}</span>
          </div>
          {drafts.length > 0 && (
            <ul className="grid gap-2" aria-label={t.quiz.drafts}>
              {drafts.map((d, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: drafts only grow while they are written
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => use(d)}
                    className="w-full rounded-xl border border-border bg-surface-secondary p-2 text-left text-sm hover:border-accent"
                  >
                    <span className="font-medium">{d.question}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {d.options.map((o, j) => `${LETTERS[j]}) ${o}`).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{t.quiz.question}</span>
        <textarea
          value={question}
          rows={2}
          maxLength={QUIZ_LIMITS.question}
          onChange={(e) => setQuestion(e.target.value)}
          className={`${field} py-2`}
        />
      </label>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t.quiz.options}</legend>
        {options.map((option, i) => (
          <div key={LETTERS[i]} className="flex items-center gap-2">
            <input
              type="radio"
              name="correct"
              checked={correct === i}
              onChange={() => setCorrect(i)}
              aria-label={t.quiz.markCorrect(LETTERS[i] ?? '')}
              className="size-4 accent-[var(--success)]"
            />
            <input
              value={option}
              maxLength={QUIZ_LIMITS.option}
              aria-label={t.quiz.option(LETTERS[i] ?? '')}
              onChange={(e) => setOptions((list) => list.map((o, j) => (j === i ? e.target.value : o)))}
              className={`${field} h-9`}
            />
          </div>
        ))}
        <span className="text-xs text-muted">{t.quiz.optionsHelp}</span>
      </fieldset>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="primary">
          {t.quiz.launch}
        </Button>
        <Button size="sm" variant="ghost" onPress={onDone}>
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}

/** The staff's view of the running question: counts per option, the right one marked. */
function QuizResults({ state, host }: { state: QuizState; host: boolean }) {
  const t = useT();
  const live = useLive();
  const [names, setNames] = useState(false);
  const { quiz, tally, reveal } = state;
  const counts = tally?.counts ?? reveal?.counts ?? quiz.options.map(() => 0);
  const total = Math.max(
    1,
    counts.reduce((a, b) => a + b, 0),
  );
  return (
    <div className="mt-4 rounded-xl bg-surface p-3" data-testid="quiz-results">
      <p className="flex items-start gap-2 text-sm font-semibold">
        <CircleHelp className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" /> {quiz.question}
      </p>
      <ul className="mt-3 grid gap-2" aria-live="polite">
        {quiz.options.map((option, i) => (
          <li key={LETTERS[i]} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className={`min-w-0 ${quiz.correct === i ? 'font-semibold text-success' : ''}`}>
                {LETTERS[i]}) {option}{' '}
                {quiz.correct === i && <CircleCheck className="inline size-4" aria-label={t.quiz.correct} />}
              </span>
              <span className="tabular-nums" data-testid={`quiz-count-${i}`}>
                {counts[i] ?? 0}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-secondary">
              <div
                className={`h-full rounded-full ${quiz.correct === i ? 'bg-success' : 'bg-accent'}`}
                style={{ width: `${((counts[i] ?? 0) / total) * 100}%` }}
              />
            </div>
            {names && tally && <p className="mt-1 text-xs text-muted">{tally.names[i]?.join(', ') || '—'}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">{t.quiz.waiting(tally?.waiting ?? 0)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {host && !reveal && (
          <Button size="sm" variant="primary" onPress={live?.revealQuiz}>
            {t.quiz.reveal}
          </Button>
        )}
        <Button size="sm" variant="ghost" onPress={() => setNames(!names)} aria-pressed={names}>
          {names ? t.live.hideNames : t.live.showNames}
        </Button>
        {host && (
          <Button size="sm" variant="ghost" onPress={live?.stopQuiz}>
            {t.quiz.close}
          </Button>
        )}
      </div>
    </div>
  );
}

/** For a joined student: the question, one tap to answer, and the right answer once revealed. */
export function QuizStudent() {
  const t = useT();
  const live = useLive();
  const state = live?.socket.quiz;
  if (!live || !state) return null;
  const { quiz, mine, reveal } = state;
  const answered = mine !== null;
  return (
    <div className="mt-3 rounded-xl bg-surface p-3" data-testid="quiz-student">
      <p className="flex items-start gap-2 text-sm font-semibold">
        <CircleHelp className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" /> {quiz.question}
      </p>
      <div className="mt-3 grid gap-2">
        {quiz.options.map((option, i) => {
          const right = reveal?.correct === i;
          const chosen = mine === i;
          const tone = right
            ? 'border-success bg-success/10 text-success'
            : reveal && chosen
              ? 'border-danger bg-danger/8 text-danger'
              : chosen
                ? 'border-accent bg-accent-soft/50'
                : 'border-border';
          return (
            <button
              key={LETTERS[i]}
              type="button"
              disabled={answered || reveal !== null}
              aria-pressed={chosen}
              onClick={() => live.answerQuiz(quiz.id, i)}
              className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm ${tone} ${answered ? '' : 'hover:border-accent'}`}
            >
              <span>
                {LETTERS[i]}) {option}
              </span>
              {reveal && <span className="tabular-nums text-xs">{reveal.counts[i] ?? 0}</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted" aria-live="polite">
        {reveal
          ? mine === reveal.correct
            ? t.quiz.youWereRight
            : answered
              ? t.quiz.youWereWrong
              : t.quiz.revealed
          : answered
            ? t.quiz.sent
            : t.quiz.answerOnce}
      </p>
    </div>
  );
}

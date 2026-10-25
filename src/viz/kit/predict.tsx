import { Button } from '@heroui/react';
import { CircleCheck, CircleHelp, CircleX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Question } from '../algorithms/predict';
import { PREDICT_TEXT } from '../algorithms/predict.text';
import { Toggle } from './controls';
import { RichText } from './RichText';
import { decisionKey, result, useResults } from './results';
import { useText } from './text';
import type { Player } from './usePlayer';

// Predict mode (#127): watching teaches little; predicting the next step is where learning happens.
// The hook wraps a visualization's player: with predict mode on, moving forward (next, play, the
// slider, end) stops at the first decision not yet answered and asks; the answer is checked, the
// step plays, and a score is kept. Moving back is always free. Each visualization only says which
// steps are decisions (`questionAt`), so any of them can add it.

export interface Predict<S> {
  player: Player<S>;
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  question: Question | null;
  answer: (id: string) => void;
  feedback: { ok: boolean; question: Question } | null;
  right: number;
  asked: number;
}

export function usePredict<S>(
  player: Player<S>,
  questionAt: (index: number) => Question | null,
  steps: S[],
  baseDelay = 900,
): Predict<S> {
  const [enabled, setEnabledState] = useState(false);
  const [answered, setAnswered] = useState<Record<number, boolean>>({});
  const [pending, setPending] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Predict<S>['feedback']>(null);
  const [auto, setAuto] = useState(false);

  // A new run (new input or algorithm) starts the questions over.
  const [run, setRun] = useState(steps);
  if (run !== steps) {
    setRun(steps);
    setAnswered({});
    setPending(null);
    setFeedback(null);
    setAuto(false);
  }

  const { index, total, atEnd } = player;
  const firstOpen = useCallback(
    (from: number, to: number) => {
      for (let k = from; k <= to; k++) if (!(k in answered) && questionAt(k)) return k;
      return null;
    },
    [answered, questionAt],
  );
  const ask = useCallback(
    (k: number) => {
      player.go(k - 1);
      setPending(k);
      setAuto(false);
    },
    [player],
  );

  const next = useCallback(() => {
    if (!enabled) return player.next();
    if (pending !== null) return;
    const k = firstOpen(index + 1, index + 1);
    if (k !== null) ask(k);
    else player.next();
  }, [enabled, pending, firstOpen, index, ask, player]);

  const go = useCallback(
    (i: number) => {
      if (!enabled || i <= index) {
        setPending(null);
        return player.go(i);
      }
      const k = firstOpen(index + 1, i);
      if (k !== null) ask(k);
      else player.go(i);
    },
    [enabled, index, firstOpen, ask, player],
  );

  // Playing in predict mode: step forward on our own clock until the next question.
  useEffect(() => {
    if (!enabled || !auto || pending !== null) return;
    if (atEnd) return setAuto(false);
    const timer = window.setTimeout(next, baseDelay / player.speed);
    return () => window.clearTimeout(timer);
  }, [enabled, auto, pending, atEnd, next, baseDelay, player.speed]);

  const report = useResults();
  const answer = useCallback(
    (id: string) => {
      if (pending === null) return;
      const q = questionAt(pending);
      if (!q) return;
      const ok = q.answers.includes(id);
      // In a lab, the first answer counts in the student's results (#151).
      report?.(
        result({
          topic: q.topic,
          decision: decisionKey(
            pending,
            q.options.map((o) => o.id),
            q.answers,
          ),
          right: ok,
          pick: q.options.find((o) => o.id === id)?.label ?? id,
          answer: q.answerLabel,
          prompt: q.prompt,
        }),
      );
      setAnswered((a) => ({ ...a, [pending]: ok }));
      setFeedback({ ok, question: q });
      player.go(pending);
      setPending(null);
    },
    [pending, questionAt, player, report],
  );

  const setEnabled = useCallback(
    (on: boolean) => {
      setEnabledState(on);
      setAnswered({});
      setPending(null);
      setFeedback(null);
      setAuto(false);
      if (on) player.reset();
    },
    [player],
  );

  const wrapped = useMemo<Player<S>>(
    () =>
      enabled
        ? {
            ...player,
            playing: auto,
            next,
            go,
            end: () => go(total - 1),
            prev: () => {
              setPending(null);
              setAuto(false);
              player.prev();
            },
            reset: () => {
              setPending(null);
              setAuto(false);
              player.reset();
            },
            pause: () => setAuto(false),
            toggle: () => {
              if (pending !== null) return;
              if (atEnd) {
                player.reset();
                setAuto(true);
              } else setAuto((a) => !a);
            },
          }
        : player,
    [enabled, player, auto, next, go, total, pending, atEnd],
  );

  const values = Object.values(answered);
  return {
    player: wrapped,
    enabled,
    setEnabled,
    question: pending !== null ? questionAt(pending) : null,
    answer,
    feedback,
    right: values.filter(Boolean).length,
    asked: values.length,
  };
}

/** The switch, the score, the open question and the verdict on the last one. */
export function PredictPanel<S>({ predict }: { predict: Predict<S> }) {
  const P = useText(PREDICT_TEXT);
  const { question, feedback } = predict;
  return (
    <div className="grid gap-2" data-testid="predict">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Toggle label={P.mode} value={predict.enabled} onChange={predict.setEnabled} />
        <span className="text-xs text-muted">
          {predict.enabled && predict.asked > 0 ? P.score(predict.right, predict.asked) : P.help}
        </span>
      </div>
      {predict.enabled && question && (
        <fieldset
          className="grid gap-2 rounded-xl border-2 border-[var(--state-current)] bg-surface p-3"
          aria-describedby="predict-choose"
        >
          <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
            <CircleHelp className="size-4 text-[var(--state-current)]" aria-hidden="true" /> {question.prompt}
          </legend>
          <div className="flex flex-wrap gap-2">
            {question.options.map((o) => (
              <Button
                key={o.id}
                size="sm"
                variant="secondary"
                onPress={() => predict.answer(o.id)}
                className="font-mono"
              >
                {o.label}
              </Button>
            ))}
          </div>
          <span id="predict-choose" className="text-xs text-muted">
            {P.choose}
          </span>
        </fieldset>
      )}
      {predict.enabled && !question && feedback && (
        <p
          className={`flex items-start gap-2 text-sm ${feedback.ok ? 'text-success' : 'text-danger'}`}
          aria-live="polite"
          data-testid="predict-feedback"
        >
          {feedback.ok ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          <span>
            <strong>{feedback.ok ? P.right : P.wrong(feedback.question.answerLabel)}</strong>{' '}
            <span className="text-muted">
              <RichText text={feedback.question.explain} />
            </span>
          </span>
        </p>
      )}
    </div>
  );
}

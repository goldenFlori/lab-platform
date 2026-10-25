import { Button } from '@heroui/react';
import { CircleCheck, CircleX, RotateCcw } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import type { TopicResult } from '../shared/predictions';
import type { ReviewTopic } from '../shared/review';
import { PREDICT_TEXT } from './algorithms/predict.text';
import { type EdgeLook, GraphCanvas, type NodeLook } from './kit/GraphCanvas';
import { RichText } from './kit/RichText';
import { useText } from './kit/text';
import { makeItem, type ReviewItem, type ReviewView, sessionTopics } from './review';
import { REVIEW_TEXT } from './review.text';

// The review session (#152): a few predict questions in a row, each on a fresh input and drawn with
// the state it is asked in, mixed across the topics of the labs a student has opened. At the end:
// what went right, and what to revisit with a link to its lab.

const soft = (c: string, p = 28) => `color-mix(in oklab, ${c} ${p}%, var(--surface))`;

type Answer = { item: ReviewItem; right: boolean };

export default function ReviewSession({
  topics,
  results,
  topicName,
  labLink,
  onAnswer,
}: {
  topics: ReviewTopic[];
  results: TopicResult[];
  topicName: (topic: ReviewTopic) => string;
  /** A link to the first lab that teaches the topic. */
  labLink: (topic: ReviewTopic) => ReactNode;
  /** Each answer, so the page can remember it for the next session. */
  onAnswer?: (topic: ReviewTopic, right: boolean) => void;
}) {
  const P = useText(PREDICT_TEXT);
  const R = useText(REVIEW_TEXT);
  const build = () => sessionTopics(topics, results).map((topic) => makeItem(topic, P));
  const [items, setItems] = useState<ReviewItem[]>(build);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);

  const restart = () => {
    setItems(build());
    setAt(0);
    setAnswers([]);
    setChosen(null);
  };

  const item = items[at];
  if (!item) {
    const right = answers.filter((a) => a.right).length;
    const missed = [...new Set(answers.filter((a) => !a.right).map((a) => a.item.topic))];
    return (
      <section
        className="rounded-3xl border border-border bg-surface p-5 shadow-surface sm:p-7"
        data-testid="review-done"
      >
        <h2 className="text-xl font-bold">{R.doneTitle}</h2>
        <p className="mt-1 text-muted">{R.score(right, answers.length)}</p>
        {missed.length ? (
          <>
            <h3 className="mt-5 text-sm font-semibold">{R.revisit}</h3>
            <ul className="mt-2 grid gap-2">
              {missed.map((topic) => (
                <li
                  key={topic}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-secondary px-3 py-2 text-sm"
                >
                  <span className="font-medium">{topicName(topic)}</span>
                  {labLink(topic)}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-4 text-sm text-success">{R.allRight}</p>
        )}
        <Button className="mt-6" variant="primary" onPress={restart}>
          <RotateCcw /> {R.again}
        </Button>
      </section>
    );
  }

  const q = item.question;
  const answer = (id: string) => {
    if (chosen) return;
    const right = q.answers.includes(id);
    setChosen(id);
    setAnswers((list) => [...list, { item, right }]);
    onAnswer?.(item.topic, right);
  };
  const ok = chosen !== null && q.answers.includes(chosen);

  return (
    <section className="rounded-3xl border border-border bg-surface shadow-surface" data-testid="review">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-separator px-4 py-3 sm:px-5">
        <span className="text-sm text-muted">{R.progress(at + 1, items.length)}</span>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
          {topicName(item.topic)}
        </span>
      </header>
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <View view={item.view} label={q.prompt} />
        <div className="flex min-w-0 flex-col gap-3">
          <fieldset className="grid gap-3">
            <legend className="text-base font-semibold">{q.prompt}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {q.options.map((o) => {
                const tone =
                  chosen === null
                    ? 'secondary'
                    : q.answers.includes(o.id)
                      ? 'primary'
                      : o.id === chosen
                        ? 'danger'
                        : 'tertiary';
                return (
                  <Button
                    key={o.id}
                    size="sm"
                    variant={tone}
                    className="font-mono"
                    isDisabled={chosen !== null && tone === 'tertiary'}
                    onPress={() => answer(o.id)}
                  >
                    {o.label}
                  </Button>
                );
              })}
            </div>
          </fieldset>
          {chosen !== null && (
            <>
              <p
                className={`flex items-start gap-2 text-sm ${ok ? 'text-success' : 'text-danger'}`}
                aria-live="polite"
                data-testid="review-feedback"
              >
                {ok ? (
                  <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                )}
                <span>
                  <strong>{ok ? R.right : R.wrong(q.answerLabel)}</strong>{' '}
                  <span className="text-muted">
                    <RichText text={q.explain} />
                  </span>
                </span>
              </p>
              <Button
                className="self-start"
                variant="primary"
                onPress={() => {
                  setAt((n) => n + 1);
                  setChosen(null);
                }}
              >
                {at + 1 < items.length ? R.next : R.finish}
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function View({ view, label }: { view: ReviewView; label: string }) {
  const R = useText(REVIEW_TEXT);
  if (view.kind === 'array')
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {view.values.map((v, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: a position in a fixed array
              key={i}
              className="grid size-11 place-items-center rounded-xl border-2 font-mono text-base font-semibold"
              style={{
                borderColor:
                  i === view.key ? 'var(--state-current)' : i < view.done ? 'var(--state-done)' : 'var(--border)',
                background: i < view.done ? soft('var(--state-done)', 18) : undefined,
              }}
            >
              {v}
            </span>
          ))}
        </div>
        {view.done > 0 && (
          <p className="text-xs text-muted">
            0–{view.done - 1}: {R.sorted}
          </p>
        )}
      </div>
    );
  if (view.kind === 'merge')
    return (
      <dl className="grid gap-2 text-sm">
        {(
          [
            [R.left, view.left],
            [R.right_, view.right],
            [R.written, view.written],
          ] as const
        ).map(([label, list]) => (
          <div key={label} className="flex flex-wrap items-center gap-2">
            <dt className="w-40 text-muted">{label}</dt>
            <dd className="flex flex-wrap gap-1.5 font-mono">
              {list.length ? (
                list.map((v) => (
                  <span
                    key={v}
                    className="grid size-9 place-items-center rounded-lg border border-border font-semibold"
                  >
                    {v}
                  </span>
                ))
              ) : (
                <span className="text-muted">—</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    );
  if (view.kind === 'matrix') {
    const k = view.labels[view.k] ?? '';
    return (
      <div className="overflow-x-auto">
        <p className="mb-2 text-xs text-muted">{R.matrix(k)}</p>
        <table className="border-collapse font-mono text-sm">
          <thead>
            <tr>
              <th />
              {view.labels.map((b, j) => (
                <th key={b} className={`px-2 pb-1 text-xs ${j === view.k ? 'text-accent' : 'text-muted'}`}>
                  {b}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.D.map((row, i) => (
              <tr key={view.labels[i]}>
                <th className={`pr-2 text-right text-xs ${i === view.k ? 'text-accent' : 'text-muted'}`}>
                  {view.labels[i]}
                </th>
                {row.map((v, j) => (
                  <td
                    key={view.labels[j]}
                    className="border border-border px-3 py-1.5 text-center"
                    style={{
                      background:
                        i === view.i && j === view.j
                          ? soft('var(--state-current)', 30)
                          : i === view.k || j === view.k
                            ? soft('var(--state-frontier)', 18)
                            : undefined,
                    }}
                  >
                    {v === Infinity ? '∞' : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const nodeLook = (n: { id: string }): NodeLook => {
    const dist = view.dist ? view.dist[n.id] : undefined;
    const sub = dist === undefined ? null : dist === Infinity ? '∞' : String(dist);
    const badge = view.badges?.[n.id] ?? null;
    if (view.done.includes(n.id))
      return {
        fill: soft('var(--state-visited)', 32),
        stroke: 'var(--state-visited)',
        sub,
        badge,
        badgeColor: 'var(--state-done)',
      };
    if (view.waiting.includes(n.id))
      return { fill: soft('var(--state-frontier)', 30), stroke: 'var(--state-frontier)', sub };
    return { sub, badge };
  };
  const edgeLook = (_: unknown, i: number): EdgeLook => {
    const label = view.labels?.[i] ?? undefined;
    if (view.focus.includes(i)) return { stroke: 'var(--state-current)', width: 4, front: true, label };
    if (view.tree.includes(i)) return { stroke: 'var(--state-path)', width: 4, label };
    if (view.rejected.includes(i)) return { stroke: 'var(--state-reject)', dash: '3 4', dim: true, label };
    return { label };
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-2xl border border-border bg-[var(--viz-canvas)] bg-grid">
        <GraphCanvas
          nodes={view.nodes}
          edges={view.edges}
          directed={view.directed}
          width={600}
          height={380}
          nodeLook={nodeLook}
          edgeLook={edgeLook}
          maxHeight="320px"
          ariaLabel={label}
        />
      </div>
      {view.structure && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{view.structure.kind === 'queue' ? R.queue : R.stack}:</span>
          {view.structure.items.map((v) => (
            <span key={v} className="rounded-md border border-border px-2 py-0.5 font-mono">
              {v}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

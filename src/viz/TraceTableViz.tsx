import { Button } from '@heroui/react';
import { Eye, Pause, Play, RotateCcw, Table2 } from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react';
import type { PredictionTopic } from '../shared/predictions';
import { isTraceProblem, type TraceProblem } from '../shared/trace-problem';
import { display, firstWrong, type Trace, type TraceRow, traceIds, traceOf } from './algorithms/trace';
import { TRACE_TEXT, type TraceText } from './algorithms/trace.text';
import { isTracePresetId, TRACE_PRESET_IDS, TRACE_PRESETS, type TracePresetId } from './algorithms/trace-presets';
import { Choice, Field } from './kit/controls';
import { type EdgeLook, type GEdge, type GNode, GraphCanvas, type NodeLook } from './kit/GraphCanvas';
import { hash, result, useResults } from './kit/results';
import { Panel, StepNote, VizShell } from './kit/shell';
import { useText } from './kit/text';

// Trace tables (#150): the hand-tracing class problems, checked row by row. The student fills a
// row as on paper; a wrong row marks its first wrong cell with the rule it breaks, never the
// value; after three tries the row can be shown. The graph beside it shows any finished row.
// A lab can give the course's own problems (a preset) or a pedagog's own (`problem`, #166).

/** What a table needs besides the problem: how it is named, its tie rule, its key for the results. */
interface Shown {
  id: string;
  name: string;
  rule: string;
  problem: TraceProblem;
}

const soft = (c: string, p = 26) => `color-mix(in oklab, ${c} ${p}%, var(--surface))`;

/** The tie rule of a problem, written out with its own vertices and edges. */
function ruleOf(p: TraceProblem, X: TraceText) {
  const R = X.custom.rules;
  switch (p.algorithm) {
    case 'bellman':
      return R.bellman(p.edges.map((e) => `${e.u}→${e.v}`).join(', '), p.nodes.length - 1);
    case 'kahn':
      return R.kahn(p.nodes.map((n) => n.id).join(', '));
    case 'floyd':
      return R.floyd(traceIds(p).join(', '));
    default:
      return R[p.algorithm];
  }
}

export default function TraceTableViz({
  preset: initial = 'lab07-dijkstra',
  problem,
}: {
  preset?: string;
  /** A pedagog's own problem (#166); ignored unless it follows the rules. */
  problem?: unknown;
}) {
  const X = useText(TRACE_TEXT);
  const [presetId, setPresetId] = useState<TracePresetId>(isTracePresetId(initial) ? initial : 'lab07-dijkstra');
  const own = isTraceProblem(problem) ? problem : null;
  const shown: Shown = own
    ? {
        id: `custom-${hash(JSON.stringify(own))}`,
        name: X.custom.name(X.custom.algorithms[own.algorithm]),
        rule: ruleOf(own, X),
        problem: own,
      }
    : {
        id: presetId,
        name: X.presets[presetId]?.name ?? presetId,
        rule: X.presets[presetId]?.rule ?? ruleOf(TRACE_PRESETS[presetId], X),
        problem: TRACE_PRESETS[presetId],
      };
  return (
    <VizShell
      title={X.title}
      subtitle={X.subtitle}
      icon={<Table2 />}
      toolbar={
        own ? undefined : (
          <Field label={X.problem}>
            <Choice
              label={X.problem}
              value={presetId}
              onChange={setPresetId}
              className="w-64"
              options={TRACE_PRESET_IDS.map((id) => ({ value: id, label: X.presets[id]?.name ?? id }))}
            />
          </Field>
        )
      }
    >
      {/* A new problem starts a new table. */}
      <TraceTable key={shown.id} item={shown} X={X} />
    </VizShell>
  );
}

type Result = 'right' | 'later' | 'revealed';

function TraceTable({ item, X }: { item: Shown; X: TraceText }) {
  const { problem } = item;
  const topic = `trace-${problem.algorithm}` as PredictionTopic;
  // Vertices alphabetically, except Kahn's, whose queue follows the order the problem lists them in.
  const ids = useMemo(() => traceIds(problem), [problem]);
  const trace = useMemo<Trace>(() => traceOf(problem, X.words), [problem, X]);
  const nodes: GNode[] = problem.nodes;
  const edges: GEdge[] = useMemo(() => problem.edges.map(({ u, v, w }) => ({ u, v, w })), [problem]);
  const pill = problem.nodes.some((n) => n.id.length > 2);
  const W = X.words;
  const [results, setResults] = useState<Result[]>([]);
  const at = results.length;
  const row = trace.rows[at];
  const done = !row;

  // A row starts from the one above it for numbers (as on paper, copy and update); the rest is blank.
  const startFor = (index: number) => {
    const above = index === 0 ? trace.given : trace.rows[index - 1];
    const keys = trace.matrix
      ? trace.matrix.flatMap((a) => trace.matrix?.map((b) => `${a},${b}`) ?? [])
      : trace.columns.map((c) => c.key);
    return Object.fromEntries(
      keys.map((key) => {
        const kind = trace.matrix ? 'number' : trace.columns.find((c) => c.key === key)?.kind;
        return [key, kind === 'number' ? (above?.cells[key] ?? '') : ''];
      }),
    );
  };
  const [answers, setAnswers] = useState<Record<string, string>>(() => startFor(0));
  const [tries, setTries] = useState(0);
  const [wrongKey, setWrongKey] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; tone: 'accent' | 'success' | 'danger' | 'warning' }>({
    text: X.status.start,
    tone: 'accent',
  });
  const [shown, setShown] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const advance = (result: Result) => {
    const next = [...results, result];
    setResults(next);
    setTries(0);
    setWrongKey(null);
    setShown(next.length - 1);
    if (next.length < trace.rows.length) setAnswers(startFor(next.length));
    return next;
  };

  const report = useResults();
  const check = () => {
    if (!row) return;
    const keys = Object.keys(answers);
    if (keys.some((k) => !answers[k]?.trim())) return setStatus({ text: X.status.empty, tone: 'warning' });
    const wrong = firstWrong(trace, row, answers, ids);
    const cellName = (key: string, label: string) => (trace.matrix ? `D[${key.replace(',', '][')}]` : label);
    // In a lab, the first check of each row counts in the student's results (#151): right or not,
    // and which cell was wrong first.
    if (tries === 0)
      report?.(
        result({
          topic,
          decision: `${item.id}:${at}`,
          right: !wrong,
          pick: wrong ? X.cell(cellName(wrong.key, wrong.column.label)) : '',
          answer: '',
          prompt: `${item.name} · ${row.label}`,
        }),
      );
    if (!wrong) {
      const next = advance(tries === 0 ? 'right' : 'later');
      if (next.length === trace.rows.length) {
        setStatus({ text: X.status.done(next.filter((r) => r === 'right').length, next.length), tone: 'success' });
      } else setStatus({ text: X.status.right(row.label), tone: 'success' });
      return;
    }
    setTries((t) => t + 1);
    setWrongKey(wrong.key);
    setStatus({ text: X.status.wrong(cellName(wrong.key, wrong.column.label), wrong.column.rule), tone: 'danger' });
  };

  const reveal = () => {
    if (!row) return;
    const next = advance('revealed');
    setStatus(
      next.length === trace.rows.length
        ? { text: X.status.done(next.filter((r) => r === 'right').length, next.length), tone: 'success' }
        : { text: X.status.revealed(row.label), tone: 'warning' },
    );
  };

  const restart = () => {
    setResults([]);
    setAnswers(startFor(0));
    setTries(0);
    setWrongKey(null);
    setShown(null);
    setPlaying(false);
    setStatus({ text: X.status.start, tone: 'accent' });
  };

  // Replay: the finished rows on the graph, one after another.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setShown((s) => {
        const next = s === null ? 0 : s + 1;
        if (next >= results.length) {
          setPlaying(false);
          return results.length - 1;
        }
        return next;
      });
    }, 1100);
    return () => window.clearInterval(timer);
  }, [playing, results.length]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      check();
    }
  };

  /* ---- graph ---- */
  const view: TraceRow = (shown !== null ? trace.rows[shown] : undefined) ?? trace.given;
  const nodeLook = (n: GNode): NodeLook => {
    const dist = view.cells[`d:${n.id}`];
    const sub = dist && dist !== '—' ? dist : null;
    if (view.mark.current === n.id)
      return {
        fill: soft('var(--state-current)', 32),
        stroke: 'var(--state-current)',
        ring: 'var(--state-current)',
        sub,
      };
    if (view.mark.vertices.includes(n.id))
      return { fill: soft('var(--state-visited)', 32), stroke: 'var(--state-visited)', sub };
    return { sub };
  };
  const edgeLook = (_: GEdge, i: number): EdgeLook =>
    view.mark.edges.includes(i) ? { stroke: 'var(--state-path)', width: 4, front: true } : {};

  const rule = item.rule;
  const cellClass = (key: string) =>
    `w-full min-w-[3.2rem] rounded-lg border bg-surface px-2 py-1.5 text-center font-mono text-sm outline-none focus:border-accent ${
      wrongKey === key ? 'border-danger ring-2 ring-danger/40' : 'border-border'
    }`;
  const resultClass = (r: Result | undefined) => (r === 'revealed' ? 'bg-warning/10' : r ? 'bg-success/10' : '');

  return (
    <div
      className="grid grid-cols-1 gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
      data-testid="trace"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="rounded-2xl border border-border bg-[var(--viz-canvas)] bg-grid">
          <GraphCanvas
            nodes={nodes}
            edges={edges}
            directed={problem.directed}
            shape={pill ? 'pill' : 'circle'}
            nodeLook={nodeLook}
            edgeLook={edgeLook}
            ariaLabel={item.name}
            maxHeight="360px"
          />
        </div>
        {rule && (
          <p className="text-sm text-muted">
            <strong className="text-foreground">{X.rule}:</strong> {rule}
          </p>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        {trace.matrix ? (
          <MatrixTrace
            trace={trace}
            results={results}
            answers={answers}
            setAnswers={setAnswers}
            onKey={onKey}
            cellClass={cellClass}
            shown={shown}
            setShown={setShown}
            X={X}
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-surface-secondary text-left text-xs text-muted">
                <tr>
                  <th className="px-2 py-2 font-semibold">{X.step}</th>
                  {trace.columns.map((c) => (
                    <th key={c.key} className="px-2 py-2 font-semibold whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-separator text-muted">
                  <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{trace.given.label}</th>
                  {trace.columns.map((c) => (
                    <td key={c.key} className="px-2 py-1.5 text-center font-mono">
                      {display(c.kind, trace.given.cells[c.key] ?? '', W)}
                    </td>
                  ))}
                </tr>
                {trace.rows.map((r, i) => (
                  <tr
                    key={r.label}
                    className={`border-t border-separator ${resultClass(results[i])} ${shown === i ? 'outline-2 -outline-offset-2 outline-accent' : ''}`}
                  >
                    <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                      {i < at ? (
                        <button
                          type="button"
                          className="underline-offset-2 hover:underline"
                          onClick={() => setShown(i)}
                        >
                          {r.label}
                        </button>
                      ) : (
                        r.label
                      )}
                    </th>
                    {trace.columns.map((c) => (
                      <td key={c.key} className="px-1.5 py-1 text-center font-mono">
                        {i < at ? (
                          display(c.kind, r.cells[c.key] ?? '', W)
                        ) : i === at ? (
                          <input
                            aria-label={`${r.label} · ${c.label}`}
                            className={cellClass(c.key)}
                            value={answers[c.key] ?? ''}
                            onChange={(e) => setAnswers((a) => ({ ...a, [c.key]: e.target.value }))}
                            onKeyDown={onKey}
                            autoComplete="off"
                            spellCheck={false}
                          />
                        ) : (
                          <span className="text-muted/50">·</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!done && (
            <Button size="sm" variant="primary" onPress={check}>
              {X.check}
            </Button>
          )}
          {!done && tries >= 3 && (
            <Button size="sm" variant="secondary" onPress={reveal}>
              <Eye /> {X.reveal}
            </Button>
          )}
          {at > 0 && (
            <Button
              size="sm"
              variant="tertiary"
              onPress={() => {
                if (playing) return setPlaying(false);
                setShown(null);
                setPlaying(true);
              }}
            >
              {playing ? <Pause /> : <Play />} {playing ? X.stop : X.replay}
            </Button>
          )}
          {at > 0 && (
            <Button size="sm" variant="ghost" onPress={restart}>
              <RotateCcw /> {X.restart}
            </Button>
          )}
        </div>
        <StepNote text={status.text} tone={status.tone} />
      </div>
    </div>
  );
}

function MatrixTrace({
  trace,
  results,
  answers,
  setAnswers,
  onKey,
  cellClass,
  shown,
  setShown,
  X,
}: {
  trace: Trace;
  results: Result[];
  answers: Record<string, string>;
  setAnswers: (f: (a: Record<string, string>) => Record<string, string>) => void;
  onKey: (e: KeyboardEvent) => void;
  cellClass: (key: string) => string;
  shown: number | null;
  setShown: (i: number) => void;
  X: TraceText;
}) {
  const L = trace.matrix ?? [];
  const at = results.length;
  const row = trace.rows[at];
  const k = row?.mark.current;

  const grid = (cells: Record<string, string>, editable: boolean, highlight?: string | null) => (
    <table className="border-collapse font-mono text-sm">
      <thead>
        <tr>
          <th />
          {L.map((b) => (
            <th key={b} className={`px-1 pb-1 text-xs ${b === highlight ? 'text-accent' : 'text-muted'}`}>
              {b}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {L.map((a) => (
          <tr key={a}>
            <th className={`pr-1.5 text-right text-xs ${a === highlight ? 'text-accent' : 'text-muted'}`}>{a}</th>
            {L.map((b) => {
              const key = `${a},${b}`;
              return (
                <td key={b} className="p-0.5 text-center">
                  {editable ? (
                    <input
                      aria-label={X.cell(`D[${a}][${b}]`)}
                      className={`${cellClass(key)} ${a === highlight || b === highlight ? 'bg-accent/5' : ''}`}
                      value={answers[key] ?? ''}
                      onChange={(e) => setAnswers((x) => ({ ...x, [key]: e.target.value }))}
                      onKeyDown={onKey}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  ) : (
                    <span className="inline-block min-w-[2.4rem] px-1.5 py-1">{cells[key]}</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const last = at === 0 ? trace.given : trace.rows[at - 1];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {trace.rows.slice(0, at).map((r, i) => (
          <Button
            key={r.label}
            size="sm"
            variant={shown === i ? 'secondary' : 'ghost'}
            onPress={() => setShown(i)}
            className={results[i] === 'revealed' ? 'text-warning' : 'text-success'}
          >
            {X.matrixAfter(r.label)}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Panel title={at === 0 ? X.givenMatrix : X.matrixAfter(trace.rows[at - 1]?.label ?? '')}>
          <div className="overflow-x-auto">{grid(last?.cells ?? {}, false)}</div>
        </Panel>
        {row && (
          <Panel title={X.matrixAfter(row.label)}>
            <div className="overflow-x-auto">{grid(row.cells, true, k)}</div>
          </Panel>
        )}
      </div>
      {shown !== null && trace.rows[shown] && shown < at - 1 && (
        <Panel title={X.matrixAfter(trace.rows[shown]?.label ?? '')}>
          <div className="overflow-x-auto">{grid(trace.rows[shown]?.cells ?? {}, false)}</div>
        </Panel>
      )}
    </div>
  );
}

import { Button } from '@heroui/react';
import { Eye, Pause, Play, RotateCcw, Table2 } from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { natural } from './algorithms/graphs';
import { layeredLayout } from './algorithms/scc';
import {
  bellmanTrace,
  dijkstraTrace,
  display,
  firstWrong,
  floydTrace,
  kahnTrace,
  kruskalTrace,
  primTrace,
  type Trace,
  type TraceRow,
} from './algorithms/trace';
import { TRACE_TEXT, type TraceText } from './algorithms/trace.text';
import { Choice, Field } from './kit/controls';
import { type EdgeLook, type GEdge, type GNode, GraphCanvas, type NodeLook } from './kit/GraphCanvas';
import { Panel, StepNote, VizShell } from './kit/shell';
import { useText } from './kit/text';

// Trace tables (#150): the hand-tracing class problems, checked row by row. The student fills a
// row as on paper; a wrong row marks its first wrong cell with the rule it breaks, never the
// value; after three tries the row can be shown. The graph beside it shows any finished row.

type PresetId = 'lab07-dijkstra' | 'lab07-bellman' | 'lab05-kruskal' | 'lab05-prim' | 'lab06-kahn' | 'lab08-floyd';

interface Preset {
  id: PresetId;
  nodes: GNode[];
  edges: GEdge[];
  directed: boolean;
  pill?: boolean;
  trace: (ids: string[], edges: GEdge[], directed: boolean, T: TraceText) => Trace;
}

const E = (list: [string, string, number?][]): GEdge[] => list.map(([u, v, w]) => ({ u, v, w }));
const N = (list: [string, number, number][]): GNode[] => list.map(([id, x, y]) => ({ id, x, y }));

// The Lab 5 class problems' graph (Problems 2 and 3), edges in the listed order.
const LAB5 = {
  nodes: N([
    ['A', 360, 55],
    ['B', 150, 190],
    ['C', 570, 190],
    ['D', 150, 365],
    ['E', 570, 365],
  ]),
  edges: E([
    ['A', 'B', 6],
    ['A', 'C', 1],
    ['B', 'C', 5],
    ['B', 'D', 3],
    ['C', 'D', 4],
    ['C', 'E', 2],
    ['D', 'E', 8],
  ]),
};

// The course DAG of Lab 6's Kahn trace, vertices in the order they join the queue.
const COURSES = ['MAT1', 'MAT2', 'PRG1', 'ALG1', 'PRG2', 'OS', 'DB', 'NET'];
const COURSE_EDGES = E([
  ['MAT1', 'MAT2'],
  ['MAT2', 'ALG1'],
  ['ALG1', 'DB'],
  ['DB', 'NET'],
  ['MAT1', 'PRG1'],
  ['PRG1', 'PRG2'],
  ['PRG2', 'OS'],
  ['OS', 'DB'],
  ['PRG2', 'NET'],
]);

export const TRACE_PRESETS: Preset[] = [
  {
    id: 'lab07-dijkstra',
    directed: true,
    nodes: N([
      ['A', 90, 90],
      ['B', 330, 90],
      ['D', 570, 90],
      ['C', 330, 320],
      ['E', 570, 320],
      ['F', 690, 210],
    ]),
    edges: E([
      ['A', 'B', 4],
      ['A', 'C', 6],
      ['B', 'C', 2],
      ['B', 'D', 3],
      ['C', 'E', 1],
      ['D', 'E', 1],
      ['D', 'F', 7],
      ['E', 'F', 2],
    ]),
    trace: (ids, edges, directed, T) => dijkstraTrace({ ids, edges, directed }, 'A', T.words),
  },
  {
    id: 'lab07-bellman',
    directed: true,
    nodes: N([
      ['A', 100, 90],
      ['B', 360, 90],
      ['C', 620, 90],
      ['D', 360, 330],
    ]),
    edges: E([
      ['A', 'B', 1],
      ['B', 'C', -4],
      ['B', 'D', 2],
      ['C', 'D', -1],
      ['D', 'A', 3],
    ]),
    trace: (ids, edges, directed, T) => bellmanTrace({ ids, edges, directed }, 'A', T.words),
  },
  {
    id: 'lab05-kruskal',
    directed: false,
    ...LAB5,
    trace: (ids, edges, directed, T) => kruskalTrace({ ids, edges, directed }, T.words),
  },
  {
    id: 'lab05-prim',
    directed: false,
    ...LAB5,
    trace: (ids, edges, directed, T) => primTrace({ ids, edges, directed }, 'A', T.words),
  },
  {
    id: 'lab06-kahn',
    directed: true,
    pill: true,
    nodes: layeredLayout(COURSES, COURSE_EDGES, 720, 380).map(({ id, x, y }) => ({ id, x, y })),
    edges: COURSE_EDGES,
    trace: (ids, edges, directed, T) => kahnTrace({ ids, edges, directed }, T.words),
  },
  {
    id: 'lab08-floyd',
    directed: true,
    nodes: N([
      ['0', 120, 80],
      ['1', 480, 80],
      ['2', 480, 320],
      ['3', 120, 320],
    ]),
    edges: E([
      ['0', '1', 3],
      ['0', '3', 7],
      ['1', '0', 8],
      ['1', '2', 2],
      ['2', '0', 5],
      ['2', '3', 1],
      ['3', '0', 2],
    ]),
    trace: (ids, edges, directed, T) => floydTrace({ ids, edges, directed }, T.words),
  },
];

const soft = (c: string, p = 26) => `color-mix(in oklab, ${c} ${p}%, var(--surface))`;

export default function TraceTableViz({ preset: initial = 'lab07-dijkstra' }: { preset?: string }) {
  const X = useText(TRACE_TEXT);
  const [presetId, setPresetId] = useState<PresetId>(
    TRACE_PRESETS.some((p) => p.id === initial) ? (initial as PresetId) : 'lab07-dijkstra',
  );
  const preset = TRACE_PRESETS.find((p) => p.id === presetId) ?? (TRACE_PRESETS[0] as Preset);
  return (
    <VizShell
      title={X.title}
      subtitle={X.subtitle}
      icon={<Table2 />}
      toolbar={
        <Field label={X.problem}>
          <Choice
            label={X.problem}
            value={presetId}
            onChange={setPresetId}
            className="w-64"
            options={TRACE_PRESETS.map((p) => ({ value: p.id, label: X.presets[p.id]?.name ?? p.id }))}
          />
        </Field>
      }
    >
      {/* A new problem starts a new table. */}
      <TraceTable key={presetId} preset={preset} X={X} />
    </VizShell>
  );
}

type Result = 'right' | 'later' | 'revealed';

function TraceTable({ preset, X }: { preset: Preset; X: TraceText }) {
  // Vertices alphabetically, except Kahn's, whose queue follows the order the problem lists them in.
  const ids = useMemo(
    () => (preset.id === 'lab06-kahn' ? COURSES : preset.nodes.map((n) => n.id).sort(natural)),
    [preset],
  );
  const trace = useMemo(() => preset.trace(ids, preset.edges, preset.directed, X), [preset, ids, X]);
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

  const check = () => {
    if (!row) return;
    const keys = Object.keys(answers);
    if (keys.some((k) => !answers[k]?.trim())) return setStatus({ text: X.status.empty, tone: 'warning' });
    const wrong = firstWrong(trace, row, answers, ids);
    if (!wrong) {
      const next = advance(tries === 0 ? 'right' : 'later');
      if (next.length === trace.rows.length) {
        setStatus({ text: X.status.done(next.filter((r) => r === 'right').length, next.length), tone: 'success' });
      } else setStatus({ text: X.status.right(row.label), tone: 'success' });
      return;
    }
    setTries((t) => t + 1);
    setWrongKey(wrong.key);
    const cell = trace.matrix ? `D[${wrong.key.replace(',', '][')}]` : wrong.column.label;
    setStatus({ text: X.status.wrong(cell, wrong.column.rule), tone: 'danger' });
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

  const rule = X.presets[preset.id]?.rule;
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
            nodes={preset.nodes}
            edges={preset.edges}
            directed={preset.directed}
            shape={preset.pill ? 'pill' : 'circle'}
            nodeLook={nodeLook}
            edgeLook={edgeLook}
            ariaLabel={X.presets[preset.id]?.name ?? preset.id}
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

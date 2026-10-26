import { useMemo, useState } from 'react';
import { tracePoints } from '../shared/trace-grading';
import {
  FIXED_DIRECTION,
  isTraceProblem,
  NEEDS_SOURCE,
  PROBLEM_LIMITS,
  problemIssue,
  TRACE_ALGORITHMS,
  type TraceAlgorithm,
  type TraceProblem,
  type TraceVariant,
  VARIANT_SIZES,
  variantIssue,
  variantProblem,
  WEIGHTED,
} from '../shared/trace-problem';
import { traceOf } from './algorithms/trace';
import { TRACE_TEXT } from './algorithms/trace.text';
import { TRACE_PRESET_IDS, TRACE_PRESETS, type TracePresetId } from './algorithms/trace-presets';
import { Choice, Field, Segmented, Toggle } from './kit/controls';
import { type EdgeLook, GraphCanvas, type NodeLook } from './kit/GraphCanvas';
import { StepNote } from './kit/shell';
import { bilingual, useText } from './kit/text';
import { TraceKey } from './TraceKey';

// The builder of a pedagog's own trace problem (#166), in the embeds editor: click the canvas for a
// vertex, two vertices for an edge, choose the algorithm and where it starts, and read the table the
// students will be checked against. It reports every change; the editor keeps it as the embed's props.

const TEXT = bilingual(
  {
    mode: 'Grafi',
    points: 'Pikë për notë',
    practice: 'ushtrim',
    pointsHelp:
      'Pa pikë, tabela është ushtrim: çdo rresht kontrollohet menjëherë. Me pikë, kur fletorja hapet për dorëzim, studentët e plotësojnë pa kontroll, ajo dorëzohet me fletoren dhe serveri e vlerëson.',
    one: 'Një për të gjithë',
    each: 'Një për çdo student',
    size: 'Kulme',
    example: 'Një shembull variantesh',
    eachHelp: (rows: number) =>
      `Çdo student merr grafin e vet me këto rregulla (këtu një shembull): ${rows} rreshta. Stafi sheh variantin e çdo studenti te laboratori.`,
    start: 'Nis nga',
    startPick: 'Një problem i laboratorit…',
    algorithm: 'Algoritmi',
    directed: 'I drejtuar',
    source: 'Nis nga kulmi',
    weight: 'Pesha e brinjës së re',
    tool: 'Veprimi',
    add: 'Shto',
    remove: 'Fshi',
    help: 'Shto: kliko bosh për një kulm, dy kulme për një brinjë, një brinjë për t’i dhënë peshën e re. Tërhiqi kulmet për t’i lëvizur. Fshi: kliko një kulm ose një brinjë.',
    canvas: 'Grafi i problemit',
    pending: (v: string) => `Brinja nis nga ${v}: kliko kulmin tjetër.`,
    ok: (rows: number) => `Gati: studentët plotësojnë ${rows} rreshta.`,
    key: 'Tabela e pritur (vetëm për stafin)',
    issues: {
      shape: 'Problemi nuk lexohet.',
      nodes: `Duhen 2 deri në ${PROBLEM_LIMITS.nodes} kulme (për Floyd-Warshall deri në ${PROBLEM_LIMITS.floydNodes}).`,
      ids: 'Çdo kulm ka emër të vetëm, deri në 4 shkronja ose shifra.',
      edges: `Duhen 1 deri në ${PROBLEM_LIMITS.edges} brinjë.`,
      endpoint: 'Një brinjë lidh një kulm që nuk ekziston.',
      loop: 'Lakët nuk lejohen.',
      duplicate: 'Dy brinjë lidhin të njëjtat kulme.',
      weight: `Peshat janë numra të plotë nga −${PROBLEM_LIMITS.weight} deri në ${PROBLEM_LIMITS.weight}.`,
      negative: 'Dijkstra nuk punon me pesha negative: zgjidhni Bellman-Ford.',
      direction: 'Ky algoritëm kërkon një graf tjetër: Prim dhe Kruskal të padrejtuar, Kahn të drejtuar.',
      source: 'Zgjidhni kulmin nga nis algoritmi.',
    },
  },
  {
    mode: 'Graph',
    points: 'Points for the grade',
    practice: 'practice',
    pointsHelp:
      'Without points the table is practice: each row is checked at once. With points, when the notebook is open for submission, students fill it unchecked, it is handed in with the notebook and the server grades it.',
    one: 'One for everyone',
    each: 'One per student',
    size: 'Vertices',
    example: 'An example variant',
    eachHelp: (rows) =>
      `Every student gets their own graph by these rules (here, an example): ${rows} rows. Staff see each student's variant in the lab.`,
    start: 'Start from',
    startPick: 'A problem of the labs…',
    algorithm: 'Algorithm',
    directed: 'Directed',
    source: 'Start from vertex',
    weight: 'Weight of a new edge',
    tool: 'Tool',
    add: 'Add',
    remove: 'Delete',
    help: 'Add: click empty space for a vertex, two vertices for an edge, an edge to give it the new weight. Drag vertices to move them. Delete: click a vertex or an edge.',
    canvas: "The problem's graph",
    pending: (v) => `The edge starts at ${v}: click the other vertex.`,
    ok: (rows) => `Ready: students fill ${rows} rows.`,
    key: 'The expected table (staff only)',
    issues: {
      shape: 'The problem cannot be read.',
      nodes: `It needs 2 to ${PROBLEM_LIMITS.nodes} vertices (up to ${PROBLEM_LIMITS.floydNodes} for Floyd-Warshall).`,
      ids: 'Each vertex has its own name, up to 4 letters or digits.',
      edges: `It needs 1 to ${PROBLEM_LIMITS.edges} edges.`,
      endpoint: 'An edge joins a vertex that does not exist.',
      loop: 'Loops are not allowed.',
      duplicate: 'Two edges join the same vertices.',
      weight: `Weights are whole numbers from −${PROBLEM_LIMITS.weight} to ${PROBLEM_LIMITS.weight}.`,
      negative: 'Dijkstra does not work with negative weights: choose Bellman-Ford.',
      direction: 'This algorithm needs another kind of graph: Prim and Kruskal undirected, Kahn directed.',
      source: 'Choose the vertex the algorithm starts from.',
    },
  },
);

const START: TraceProblem = TRACE_PRESETS['lab05-prim'];

/** The problem after a change of algorithm: its direction, its source and its weights follow. */
function withAlgorithm(p: TraceProblem, algorithm: TraceAlgorithm): TraceProblem {
  const fixed = FIXED_DIRECTION[algorithm];
  const directed = fixed ?? p.directed;
  let edges = WEIGHTED[algorithm] ? p.edges.map((e) => ({ ...e, w: e.w || 1 })) : p.edges.map((e) => ({ ...e, w: 0 }));
  if (algorithm === 'dijkstra') edges = edges.map((e) => ({ ...e, w: Math.abs(e.w) }));
  if (!directed) {
    // Undirected: a pair keeps one edge.
    const seen = new Set<string>();
    edges = edges.filter((e) => {
      const key = [e.u, e.v].sort().join('|');
      return !seen.has(key) && seen.add(key);
    });
  }
  const source = NEEDS_SOURCE[algorithm]
    ? p.nodes.some((n) => n.id === p.source)
      ? p.source
      : (p.nodes[0]?.id ?? null)
    : null;
  return { ...p, algorithm, directed, edges, source };
}

const clamp = (v: number, most: number) => Math.round(Math.min(Math.max(v, 30), most - 30));

/**
 * The builder: one graph for the whole class (#166), or a variant per student (#167) of the chosen
 * algorithm and size. It reports the embed's props: `{ problem }` or `{ variant }`.
 */
export default function TraceProblemBuilder({
  value,
  onChange,
}: {
  value: Record<string, unknown> | null;
  onChange: (props: ({ problem: TraceProblem } | { variant: TraceVariant }) & { points?: number }) => void;
}) {
  const X = useText(TEXT);
  const startVariant = variantIssue(value?.variant) === null ? (value?.variant as TraceVariant) : null;
  const [mode, setMode] = useState<'one' | 'each'>(startVariant ? 'each' : 'one');
  const [problem] = useState<TraceProblem | null>(isTraceProblem(value?.problem) ? value.problem : null);
  // The last problem or variant, so changing the points keeps it (#168).
  const [base, setBase] = useState<{ problem: TraceProblem } | { variant: TraceVariant } | null>(
    startVariant ? { variant: startVariant } : problem ? { problem } : null,
  );
  const [points, setPoints] = useState(tracePoints(value) ? String(tracePoints(value)) : '');
  const emit = (next: { problem: TraceProblem } | { variant: TraceVariant } | null, p = points) => {
    if (!next) return;
    const n = Number(p);
    onChange(Number.isInteger(n) && n > 0 && n <= 1000 ? { ...next, points: n } : next);
  };
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Field label={X.mode}>
          <Segmented
            label={X.mode}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'one', label: X.one },
              { value: 'each', label: X.each },
            ]}
          />
        </Field>
        <Field label={X.points}>
          <input
            type="number"
            aria-label={X.points}
            min={1}
            max={1000}
            value={points}
            placeholder={X.practice}
            onChange={(e) => {
              setPoints(e.target.value);
              emit(base, e.target.value);
            }}
            className="h-9 w-32 rounded-xl border border-border bg-surface px-2 font-mono text-sm"
          />
        </Field>
      </div>
      <p className="text-xs text-muted">{X.pointsHelp}</p>
      {mode === 'one' ? (
        <OneGraph
          value={problem}
          onChange={(p) => {
            setBase({ problem: p });
            emit({ problem: p });
          }}
        />
      ) : (
        <PerStudent
          value={startVariant}
          onChange={(v) => {
            setBase({ variant: v });
            emit({ variant: v });
          }}
        />
      )}
    </div>
  );
}

/** A variant per student (#167): what the graphs look like, with one example and its table. */
function PerStudent({ value, onChange }: { value: TraceVariant | null; onChange: (v: TraceVariant) => void }) {
  const X = useText(TEXT);
  const T = useText(TRACE_TEXT);
  const [spec, setSpec] = useState<TraceVariant>(value ?? { algorithm: 'prim', nodes: 6, directed: false });
  const change = (next: TraceVariant) => {
    const fixed = FIXED_DIRECTION[next.algorithm];
    const [least, most] = VARIANT_SIZES[next.algorithm === 'floyd' ? 'floyd' : 'other'];
    const clean = { ...next, directed: fixed ?? next.directed, nodes: Math.min(Math.max(next.nodes, least), most) };
    setSpec(clean);
    onChange(clean);
  };
  const [least, most] = VARIANT_SIZES[spec.algorithm === 'floyd' ? 'floyd' : 'other'];
  const example = useMemo(() => variantProblem(spec, 'shembull'), [spec]);
  const trace = useMemo(() => traceOf(example, T.words), [example, T]);
  return (
    <div className="grid gap-3" data-testid="trace-variant-builder">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Field label={X.algorithm}>
          <Choice
            label={X.algorithm}
            value={spec.algorithm}
            className="w-44"
            onChange={(algorithm) => change({ ...spec, algorithm })}
            options={TRACE_ALGORITHMS.map((a) => ({ value: a, label: T.custom.algorithms[a] }))}
          />
        </Field>
        <Field label={X.size}>
          <Choice
            label={X.size}
            value={String(spec.nodes)}
            className="w-28"
            onChange={(n) => change({ ...spec, nodes: Number(n) })}
            options={Array.from({ length: most - least + 1 }, (_, i) => ({
              value: String(least + i),
              label: String(least + i),
            }))}
          />
        </Field>
        {FIXED_DIRECTION[spec.algorithm] === undefined && (
          <Toggle label={X.directed} value={spec.directed} onChange={(directed) => change({ ...spec, directed })} />
        )}
      </div>
      <StepNote tone="success" text={X.eachHelp(trace.rows.length)} />
      <div className="rounded-2xl border border-border bg-[var(--viz-canvas)] bg-grid">
        <GraphCanvas
          nodes={example.nodes}
          edges={example.edges}
          directed={example.directed}
          showWeights={WEIGHTED[spec.algorithm]}
          ariaLabel={X.example}
          maxHeight="320px"
        />
      </div>
      <details className="rounded-xl border border-border bg-surface p-3 text-sm">
        <summary className="cursor-pointer font-medium">{X.key}</summary>
        <div className="mt-2">
          <TraceKey trace={trace} W={T.words} />
        </div>
      </details>
    </div>
  );
}

/** One graph for the whole class (#166). */
function OneGraph({ value, onChange }: { value: TraceProblem | null; onChange: (problem: TraceProblem) => void }) {
  const X = useText(TEXT);
  const T = useText(TRACE_TEXT);
  const [problem, setProblem] = useState<TraceProblem>(value ?? START);
  const [tool, setTool] = useState<'add' | 'remove'>('add');
  const [pending, setPending] = useState<string | null>(null);
  const [weight, setWeight] = useState('1');

  const change = (next: TraceProblem) => {
    setProblem(next);
    onChange(next);
  };
  const issue = problemIssue(problem);
  const trace = useMemo(() => (issue ? null : traceOf(problem, T.words)), [problem, issue, T]);
  const weighted = WEIGHTED[problem.algorithm];

  const addNode = (x: number, y: number) => {
    if (tool !== 'add') return;
    const used = new Set(problem.nodes.map((n) => n.id));
    const id = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((c) => !used.has(c));
    if (!id) return;
    const nodes = [...problem.nodes, { id, x: clamp(x, PROBLEM_LIMITS.width), y: clamp(y, PROBLEM_LIMITS.height) }];
    change({ ...problem, nodes, source: problem.source ?? (NEEDS_SOURCE[problem.algorithm] ? id : null) });
  };
  const clickNode = (id: string) => {
    if (tool === 'remove') {
      const nodes = problem.nodes.filter((n) => n.id !== id);
      change({
        ...problem,
        nodes,
        edges: problem.edges.filter((e) => e.u !== id && e.v !== id),
        source:
          problem.source === id ? (NEEDS_SOURCE[problem.algorithm] ? (nodes[0]?.id ?? null) : null) : problem.source,
      });
      return setPending(null);
    }
    if (!pending) return setPending(id);
    if (pending !== id) {
      const same = (e: { u: string; v: string }) =>
        (e.u === pending && e.v === id) || (!problem.directed && e.u === id && e.v === pending);
      const w = weighted ? Math.round(Number(weight) || 0) : 0;
      change({ ...problem, edges: [...problem.edges.filter((e) => !same(e)), { u: pending, v: id, w }] });
    }
    setPending(null);
  };
  const clickEdge = (i: number) => {
    if (tool === 'remove') return change({ ...problem, edges: problem.edges.filter((_, k) => k !== i) });
    if (weighted)
      change({
        ...problem,
        edges: problem.edges.map((e, k) => (k === i ? { ...e, w: Math.round(Number(weight) || 0) } : e)),
      });
  };
  const move = (id: string, x: number, y: number) =>
    change({
      ...problem,
      nodes: problem.nodes.map((n) =>
        n.id === id ? { ...n, x: clamp(x, PROBLEM_LIMITS.width), y: clamp(y, PROBLEM_LIMITS.height) } : n,
      ),
    });

  const nodeLook = (n: { id: string }): NodeLook =>
    n.id === pending
      ? { ring: 'var(--state-current)', stroke: 'var(--state-current)' }
      : n.id === problem.source
        ? { stroke: 'var(--state-path)', strokeWidth: 3 }
        : {};
  const edgeLook = (): EdgeLook => (weighted ? {} : { label: null });
  const field = 'h-9 w-24 rounded-xl border border-border bg-surface px-2 font-mono text-sm';

  return (
    <div className="grid gap-3" data-testid="trace-builder">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Field label={X.start}>
          <Choice<TracePresetId | ''>
            label={X.start}
            value=""
            className="w-56"
            onChange={(id) => {
              if (!id) return;
              setPending(null);
              change(TRACE_PRESETS[id]);
            }}
            options={[
              { value: '', label: X.startPick },
              ...TRACE_PRESET_IDS.map((id) => ({ value: id, label: T.presets[id]?.name ?? id })),
            ]}
          />
        </Field>
        <Field label={X.algorithm}>
          <Choice
            label={X.algorithm}
            value={problem.algorithm}
            className="w-44"
            onChange={(a) => change(withAlgorithm(problem, a))}
            options={TRACE_ALGORITHMS.map((a) => ({ value: a, label: T.custom.algorithms[a] }))}
          />
        </Field>
        {NEEDS_SOURCE[problem.algorithm] && (
          <Field label={X.source}>
            <Choice
              label={X.source}
              value={problem.source ?? ''}
              className="w-28"
              onChange={(source) => change({ ...problem, source })}
              options={problem.nodes.map((n) => ({ value: n.id, label: n.id }))}
            />
          </Field>
        )}
        {FIXED_DIRECTION[problem.algorithm] === undefined && (
          <Toggle
            label={X.directed}
            value={problem.directed}
            onChange={(directed) => change(withAlgorithm({ ...problem, directed }, problem.algorithm))}
          />
        )}
        {weighted && (
          <Field label={X.weight}>
            <input
              type="number"
              aria-label={X.weight}
              value={weight}
              min={-PROBLEM_LIMITS.weight}
              max={PROBLEM_LIMITS.weight}
              onChange={(e) => setWeight(e.target.value)}
              className={field}
            />
          </Field>
        )}
        <Field label={X.tool}>
          <Segmented
            label={X.tool}
            value={tool}
            onChange={(t) => {
              setTool(t);
              setPending(null);
            }}
            options={[
              { value: 'add', label: X.add },
              { value: 'remove', label: X.remove },
            ]}
          />
        </Field>
      </div>
      <p className="text-xs text-muted">{X.help}</p>
      <div className="rounded-2xl border border-border bg-[var(--viz-canvas)] bg-grid">
        <GraphCanvas
          nodes={problem.nodes}
          edges={problem.edges}
          directed={problem.directed}
          showWeights={weighted}
          shape={problem.nodes.some((n) => n.id.length > 2) ? 'pill' : 'circle'}
          nodeLook={nodeLook}
          edgeLook={edgeLook}
          onBackgroundClick={addNode}
          onNodeClick={clickNode}
          onEdgeClick={clickEdge}
          onNodeMove={move}
          ariaLabel={X.canvas}
          maxHeight="380px"
        />
      </div>
      <StepNote
        tone={issue ? 'danger' : pending ? 'accent' : 'success'}
        text={issue ? X.issues[issue] : pending ? X.pending(pending) : X.ok(trace?.rows.length ?? 0)}
      />
      {trace && (
        <details className="rounded-xl border border-border bg-surface p-3 text-sm">
          <summary className="cursor-pointer font-medium">{X.key}</summary>
          <div className="mt-2">
            <TraceKey trace={trace} W={T.words} />
          </div>
        </details>
      )}
    </div>
  );
}

import { Button, Input } from '@heroui/react';
import { Network } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type FibNode, fibTree, type MergeNode, mergeTree } from './algorithms/recursion';
import { RECURSION_TEXT } from './algorithms/recursion.text';
import { parseNumbers } from './algorithms/sorting';
import { SORTING_TEXT } from './algorithms/sorting.text';
import { Field, PlayerBar, Segmented, Toggle } from './kit/controls';
import { Legend, Panel, Stat, StepNote, VizShell } from './kit/shell';
import { bilingual, useText } from './kit/text';
import { playerKeys, usePlayer } from './kit/usePlayer';

// The recursion tree (#133), for Laboratori 3 ("strong induction and the recursion tree"): Merge
// Sort's calls split down to single elements and merge back up, with the work per level beside the
// tree, so T(n) = 2T(n/2) + n becomes n per level times log₂n levels. Recursive Fibonacci shows the
// other side: the same calls made again and again, and how a memo removes them.

type Mode = 'merge' | 'fib';

const TEXT = bilingual(
  {
    title: 'Pema rekursive',
    subtitle: 'Çdo thirrje është një kulm: shihni si ndahet problemi dhe sa punë bën secili nivel.',
    mode: 'Shembulli',
    modes: { merge: 'Merge Sort', fib: 'Fibonacci' },
    yourList: 'Lista (deri në 8 numra)',
    numbers: 'Lista e numrave',
    apply: 'Zbato',
    n: 'n',
    memo: 'Me kujtesë (memoizim)',
    levels: 'Puna për nivel',
    level: 'Niveli',
    calls: 'Thirrje',
    size: 'Madhësia',
    comparisons: 'Krahasime',
    total: 'Krahasime gjithsej',
    recurrence: 'T(n) = 2·T(n/2) + n  →  n punë për nivel × log₂n nivele = n·log₂n',
    callsTotal: 'Thirrje gjithsej',
    perK: 'Sa herë thirret secili fib(k)',
    fibNote:
      'Pa kujtesë, thirrjet rriten afërsisht si φⁿ (φ ≈ 1.618): eksponenciale. Me kujtesë, çdo fib(k) llogaritet një herë: 2n − 1 thirrje.',
    waiting: 'Thirrur, në pritje',
    active: 'Thirrja aktuale',
    done: 'E renditur / e kthyer',
    repeat: 'Punë e përsëritur',
    fromMemo: 'Nga kujtesa',
  },
  {
    title: 'Recursion tree',
    subtitle: 'Each call is a vertex: see how the problem splits and how much work each level does.',
    mode: 'Example',
    modes: { merge: 'Merge Sort', fib: 'Fibonacci' },
    yourList: 'List (up to 8 numbers)',
    numbers: 'List of numbers',
    apply: 'Apply',
    n: 'n',
    memo: 'With a memo (memoization)',
    levels: 'Work per level',
    level: 'Level',
    calls: 'Calls',
    size: 'Size',
    comparisons: 'Comparisons',
    total: 'Comparisons in all',
    recurrence: 'T(n) = 2·T(n/2) + n  →  n work per level × log₂n levels = n·log₂n',
    callsTotal: 'Calls in all',
    perK: 'How often each fib(k) is called',
    fibNote:
      'Without a memo, the calls grow about like φⁿ (φ ≈ 1.618): exponentially. With a memo, each fib(k) is computed once: 2n − 1 calls.',
    waiting: 'Called, waiting',
    active: 'Current call',
    done: 'Sorted / returned',
    repeat: 'Repeated work',
    fromMemo: 'From the memo',
  },
);

const DEFAULT_VALUES = [38, 27, 43, 3, 9, 82, 10, 15];
const FIB_N = ['3', '4', '5', '6', '7'];

const W = 800;
const ROW = 74;
const CELL = 24;

export default function RecursionTreeViz({
  mode: initialMode = 'merge',
  values: initialValues = DEFAULT_VALUES,
  n: initialN = 5,
}: {
  mode?: Mode;
  values?: number[];
  n?: number;
}) {
  const L = useText(TEXT);
  const R = useText(RECURSION_TEXT);
  const S = useText(SORTING_TEXT);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [values, setValues] = useState(initialValues.slice(0, 8));
  const [text, setText] = useState(initialValues.slice(0, 8).join(', '));
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(Math.min(7, Math.max(3, initialN)));
  const [memo, setMemo] = useState(false);

  const merge = useMemo(() => mergeTree(values, R), [values, R]);
  const fib = useMemo(() => fibTree(n, memo, R), [n, memo, R]);
  const steps = mode === 'merge' ? merge.steps : fib.steps;
  const player = usePlayer<(typeof steps)[number]>(steps, 800);
  const step = player.step;

  const fromText = () => {
    const r = parseNumbers(text, S.parse);
    if (r.values.length) {
      const next = r.values.slice(0, 8);
      setValues(next);
      setText(next.join(', '));
    }
    setError(r.error);
  };

  const depth = Math.max(...(mode === 'merge' ? merge.nodes : fib.nodes).map((node) => node.depth), 0);
  const height = (depth + 1) * ROW + 10;

  return (
    <VizShell
      title={L.title}
      subtitle={L.subtitle}
      icon={<Network />}
      onKeyDown={playerKeys(player)}
      toolbar={
        <>
          <Field label={L.mode}>
            <Segmented
              label={L.mode}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'merge', label: L.modes.merge },
                { value: 'fib', label: L.modes.fib },
              ]}
            />
          </Field>
          {mode === 'merge' ? (
            <Field label={L.yourList} className="min-w-[14rem] flex-1">
              <div className="flex gap-2">
                <Input
                  aria-label={L.numbers}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fromText()}
                  className="min-w-0 flex-1 font-mono text-sm"
                />
                <Button size="sm" variant="secondary" onPress={fromText}>
                  {L.apply}
                </Button>
              </div>
            </Field>
          ) : (
            <>
              <Field label={L.n}>
                <Segmented
                  label={L.n}
                  value={String(n)}
                  onChange={(v) => setN(Number(v))}
                  options={FIB_N.map((v) => ({ value: v, label: v }))}
                />
              </Field>
              <div className="pb-1">
                <Toggle label={L.memo} value={memo} onChange={setMemo} />
              </div>
            </>
          )}
        </>
      }
      footer={
        <>
          {error && mode === 'merge' && <p className="text-sm text-warning">{error}</p>}
          <StepNote text={step?.note ?? ''} />
          <PlayerBar player={player} />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="overflow-x-auto rounded-2xl border border-border bg-[var(--viz-canvas)] p-2">
            <svg viewBox={`0 0 ${W} ${height}`} className="min-w-[36rem]" role="img" aria-label={L.title}>
              {mode === 'merge' ? <MergeTree nodes={merge.nodes} step={merge.steps[player.index]} /> : null}
              {mode === 'fib' ? <FibTree nodes={fib.nodes} step={fib.steps[player.index]} /> : null}
            </svg>
          </div>
          <Legend
            items={[
              { color: 'var(--state-frontier)', label: L.waiting, shape: 'ring' },
              { color: 'var(--state-current)', label: L.active },
              { color: 'var(--state-done)', label: L.done },
              ...(mode === 'fib'
                ? [
                    { color: 'var(--state-reject)', label: L.repeat, shape: 'ring' as const },
                    { color: 'var(--state-path)', label: L.fromMemo },
                  ]
                : []),
            ]}
          />
        </div>
        <div className="grid content-start gap-3">
          {mode === 'merge' ? (
            <MergePanel nodes={merge.nodes} n={values.length} step={merge.steps[player.index]} />
          ) : (
            <FibPanel nodes={fib.nodes} step={fib.steps[player.index]} />
          )}
        </div>
      </div>
    </VizShell>
  );

  function MergePanel({
    nodes,
    n,
    step,
  }: {
    nodes: MergeNode[];
    n: number;
    step: (typeof merge.steps)[number] | undefined;
  }) {
    const levels = Math.max(...nodes.map((node) => node.depth), 0);
    return (
      <>
        <Stat label={L.total} value={step?.total ?? 0} tone="accent" />
        <Panel title={L.levels}>
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 font-medium">{L.level}</th>
                <th className="py-1 font-medium">{L.calls}</th>
                <th className="py-1 font-medium">{L.size}</th>
                <th className="py-1 font-medium">{L.comparisons}</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {Array.from({ length: levels }, (_, d) => {
                const count = nodes.filter((node) => node.depth === d).length;
                const active = step?.active !== null && step?.active !== undefined && nodes[step.active]?.depth === d;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: the row is the level itself
                  <tr key={d} className={active ? 'text-[var(--state-current)]' : ''}>
                    <td className="py-0.5">{d}</td>
                    <td className="py-0.5">{count}</td>
                    <td className="py-0.5">≈ {Math.round(n / count)}</td>
                    <td className="py-0.5 font-semibold">{step?.perLevel[d] ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[0.72rem] leading-relaxed text-muted">{L.recurrence}</p>
        </Panel>
      </>
    );
  }

  function FibPanel({ nodes, step }: { nodes: FibNode[]; step: (typeof fib.steps)[number] | undefined }) {
    const shown = new Set(step?.shown ?? []);
    // Calls that computed fib(k), and calls answered from the memo, which cost nothing.
    const computed = new Map<number, number>();
    const hits = new Map<number, number>();
    for (const node of nodes) {
      if (!shown.has(node.id)) continue;
      const tally = node.memo ? hits : computed;
      tally.set(node.k, (tally.get(node.k) ?? 0) + 1);
    }
    const ks = [...new Set([...computed.keys(), ...hits.keys()])].sort((a, b) => b - a);
    return (
      <>
        <Stat label={L.callsTotal} value={step?.calls ?? 0} tone="accent" />
        <Panel title={L.perK}>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs tabular-nums">
            {ks.map((k) => (
              <li key={k} className={(computed.get(k) ?? 0) > 1 ? 'text-[var(--state-reject)]' : ''}>
                fib({k}) × {computed.get(k) ?? 0}
                {hits.get(k) ? <span className="text-[var(--state-path)]"> +{hits.get(k)}</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.72rem] leading-relaxed text-muted">{L.fibNote}</p>
        </Panel>
      </>
    );
  }
}

const px = (x: number) => 40 + x * (W - 80);

function Edges<N extends { id: number; parent: number | null; depth: number; x: number }>({
  nodes,
  shown,
}: {
  nodes: N[];
  shown: Set<number>;
}) {
  return (
    <>
      {nodes.map((node) => {
        const parent = node.parent !== null ? nodes[node.parent] : undefined;
        if (!parent || !shown.has(node.id)) return null;
        return (
          <line
            key={node.id}
            x1={px(parent.x)}
            y1={parent.depth * ROW + 44}
            x2={px(node.x)}
            y2={node.depth * ROW + 14}
            stroke="var(--viz-line)"
            strokeWidth={1.5}
          />
        );
      })}
    </>
  );
}

function MergeTree({
  nodes,
  step,
}: {
  nodes: MergeNode[];
  step: { shown: number[]; sorted: number[]; active: number | null } | undefined;
}) {
  const shown = new Set(step?.shown ?? []);
  const sorted = new Set(step?.sorted ?? []);
  return (
    <>
      <Edges nodes={nodes} shown={shown} />
      {nodes.map((node) => {
        if (!shown.has(node.id)) return null;
        const done = sorted.has(node.id);
        const active = step?.active === node.id;
        const list = done ? node.sorted : node.values;
        const width = list.length * CELL;
        const x0 = px(node.x) - width / 2;
        const y = node.depth * ROW + 14;
        return (
          <g key={node.id}>
            <rect
              x={x0 - 3}
              y={y - 3}
              width={width + 6}
              height={CELL + 6}
              rx={8}
              fill="none"
              stroke={active ? 'var(--state-current)' : done ? 'var(--state-done)' : 'var(--state-frontier)'}
              strokeWidth={active ? 3 : 1.5}
            />
            {list.map((v, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: positions in a fixed part of the list
              <g key={i}>
                <rect
                  x={x0 + i * CELL}
                  y={y}
                  width={CELL - 2}
                  height={CELL}
                  rx={4}
                  fill={done ? 'color-mix(in oklab, var(--state-done) 22%, var(--surface))' : 'var(--surface)'}
                  stroke="var(--viz-line)"
                />
                <text
                  x={x0 + i * CELL + (CELL - 2) / 2}
                  y={y + 16}
                  textAnchor="middle"
                  className="fill-[var(--foreground)] font-mono text-[11px] font-semibold"
                >
                  {v}
                </text>
              </g>
            ))}
          </g>
        );
      })}
    </>
  );
}

function FibTree({
  nodes,
  step,
}: {
  nodes: FibNode[];
  step: { shown: number[]; returned: number[]; active: number | null } | undefined;
}) {
  const shown = new Set(step?.shown ?? []);
  const returned = new Set(step?.returned ?? []);
  return (
    <>
      <Edges nodes={nodes} shown={shown} />
      {nodes.map((node) => {
        if (!shown.has(node.id)) return null;
        const done = returned.has(node.id);
        const active = step?.active === node.id;
        const x = px(node.x);
        const y = node.depth * ROW + 14;
        const fill = node.memo
          ? 'color-mix(in oklab, var(--state-path) 22%, var(--surface))'
          : done
            ? 'color-mix(in oklab, var(--state-done) 22%, var(--surface))'
            : 'var(--surface)';
        const stroke = active
          ? 'var(--state-current)'
          : node.repeat
            ? 'var(--state-reject)'
            : node.memo
              ? 'var(--state-path)'
              : done
                ? 'var(--state-done)'
                : 'var(--state-frontier)';
        return (
          <g key={node.id}>
            <rect
              x={x - 30}
              y={y}
              width={60}
              height={30}
              rx={15}
              fill={fill}
              stroke={stroke}
              strokeWidth={active ? 3 : 1.5}
            />
            <text
              x={x}
              y={y + 13}
              textAnchor="middle"
              className="fill-[var(--foreground)] font-mono text-[10px] font-semibold"
            >
              {node.label}
            </text>
            {done && (
              <text x={x} y={y + 25} textAnchor="middle" className="fill-[var(--muted)] font-mono text-[9px]">
                = {node.value}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

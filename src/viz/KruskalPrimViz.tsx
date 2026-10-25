import { Waypoints } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { primSteps } from './algorithms/graphs';
import { GRAPHS_TEXT } from './algorithms/graphs.text';
import { kruskalQuestion, primQuestion } from './algorithms/predict';
import { PREDICT_TEXT } from './algorithms/predict.text';
import { kruskalUnionFind, type UnionFindStep } from './algorithms/unionfind';
import { UNION_FIND_TEXT } from './algorithms/unionfind.text';
import { Field, PlayerBar, Segmented } from './kit/controls';
import { type EdgeLook, type GEdge, type GNode, GraphCanvas, type NodeLook } from './kit/GraphCanvas';
import { PredictPanel, usePredict } from './kit/predict';
import { Legend, Panel, Stat, StepNote, VizShell } from './kit/shell';
import { bilingual, useText } from './kit/text';
import { playerKeys, usePlayer } from './kit/usePlayer';

// Kruskal with union-find, beside Prim (#132), for Laboratori 5. Kruskal's greedy test, "do the two
// ends have different roots?", is only fast because of the disjoint-set forest, which this draws at
// every step: union by rank keeps the trees short and path compression flattens them. Prim grows one
// tree from a start vertex on the same graph; both end with the same weight.

type View = 'both' | 'kruskal' | 'prim';

const TEXT = bilingual(
  {
    title: 'Kruskal me union-find, krahas Prim',
    subtitle: 'Dy strategji greedy për pemën përfshirëse minimum, mbi të njëjtin graf.',
    view: 'Pamja',
    views: { both: 'Të dy', kruskal: 'Kruskal', prim: 'Prim' },
    edges: 'Brinjët sipas peshës',
    forest: 'Pylli union-find',
    forestHelp: 'Shigjeta: kulmi → prindi i tij. Rrënja mban rangun (r).',
    weightKruskal: 'Pesha (Kruskal)',
    weightPrim: 'Pesha (Prim)',
    tree: 'Në pemë',
    considering: 'Po shqyrtohet',
    rejected: 'Refuzuar (cikël)',
    moved: 'Prindi sapo ndryshoi',
    graph: (name: string) => `Grafi i ${name}`,
  },
  {
    title: 'Kruskal with union-find, beside Prim',
    subtitle: 'Two greedy strategies for the minimum spanning tree, on the same graph.',
    view: 'View',
    views: { both: 'Both', kruskal: 'Kruskal', prim: 'Prim' },
    edges: 'Edges by weight',
    forest: 'Union-find forest',
    forestHelp: 'Arrow: vertex → its parent. A root shows its rank (r).',
    weightKruskal: 'Weight (Kruskal)',
    weightPrim: 'Weight (Prim)',
    tree: 'In the tree',
    considering: 'Being considered',
    rejected: 'Rejected (cycle)',
    moved: 'Parent just changed',
    graph: (name) => `${name}'s graph`,
  },
);

// The classic seven-vertex example (minimum weight 39); not the graph of any class problem.
const NODES: GNode[] = [
  { id: 'A', x: 90, y: 80 },
  { id: 'B', x: 270, y: 60 },
  { id: 'C', x: 450, y: 85 },
  { id: 'D', x: 150, y: 225 },
  { id: 'E', x: 340, y: 220 },
  { id: 'F', x: 225, y: 345 },
  { id: 'G', x: 465, y: 335 },
];
const EDGES: GEdge[] = [
  { u: 'A', v: 'B', w: 7 },
  { u: 'A', v: 'D', w: 5 },
  { u: 'B', v: 'C', w: 8 },
  { u: 'B', v: 'D', w: 9 },
  { u: 'B', v: 'E', w: 7 },
  { u: 'C', v: 'E', w: 5 },
  { u: 'D', v: 'E', w: 15 },
  { u: 'D', v: 'F', w: 6 },
  { u: 'E', v: 'F', w: 8 },
  { u: 'E', v: 'G', w: 9 },
  { u: 'F', v: 'G', w: 11 },
];

/** A colour per set, so students watch the sets merge. */
const SET_COLORS = [
  'var(--state-current)',
  'var(--state-path)',
  'var(--state-frontier)',
  'var(--state-visited)',
  'var(--state-done)',
  'var(--state-reject)',
  'var(--muted)',
];

const rootOf = (parent: Record<string, string>, v: string) => {
  let x = v;
  while (parent[x] && parent[x] !== x) x = parent[x] as string;
  return x;
};

export default function KruskalPrimViz({ view: initialView = 'both' }: { view?: View }) {
  const L = useText(TEXT);
  const U = useText(UNION_FIND_TEXT);
  const G = useText(GRAPHS_TEXT);
  const [view, setView] = useState<View>(initialView);
  const kruskal = useMemo(() => kruskalUnionFind(NODES, EDGES, U), [U]);
  const prim = useMemo(() => primSteps(NODES, EDGES, 'A', G), [G]);
  const ticks = useMemo(
    () => Array.from({ length: Math.max(kruskal.length, prim.length) }, (_, i) => i),
    [kruskal, prim],
  );
  const basePlayer = usePlayer(ticks, 900);
  // Predict mode (#149): Prim's next edge when Prim is shown alone, otherwise Kruskal's accept or reject.
  const P = useText(PREDICT_TEXT);
  const question = useCallback(
    (t: number) => (view === 'prim' ? primQuestion(prim, t, EDGES, P) : kruskalQuestion(kruskal, t, EDGES, P)),
    [view, prim, kruskal, P],
  );
  const predict = usePredict(basePlayer, question, ticks, 900);
  // Switching the view asks the other algorithm's questions from the start.
  const restartPredict = useRef(predict.setEnabled);
  restartPredict.current = predict.setEnabled;
  const predicting = useRef(predict.enabled);
  predicting.current = predict.enabled;
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs only when the view changes
  useEffect(() => {
    if (predicting.current) restartPredict.current(true);
  }, [view]);
  const player = predict.player;
  const k = kruskal[Math.min(player.index, kruskal.length - 1)] ?? kruskal[0];
  const p = prim[Math.min(player.index, prim.length - 1)] ?? prim[0];
  if (!k || !p) return null;

  // Sets keep their colour from their first vertex in alphabetical order.
  const roots = [...new Set(NODES.map((n) => rootOf(k.parent, n.id)))].sort();
  const setColor = (v: string) => {
    const root = rootOf(k.parent, v);
    const size = NODES.filter((n) => rootOf(k.parent, n.id) === root).length;
    return size > 1 ? (SET_COLORS[roots.indexOf(root) % SET_COLORS.length] ?? 'var(--muted)') : 'var(--surface)';
  };

  const kNode = (n: GNode): NodeLook => ({
    fill: setColor(n.id),
    ink: setColor(n.id) === 'var(--surface)' ? undefined : '#10172a',
    ring: k.path.includes(n.id) ? 'var(--state-current)' : undefined,
  });
  const kEdge = (_: GEdge, i: number): EdgeLook =>
    k.tree.includes(i)
      ? { stroke: 'var(--state-path)', width: 4, front: true }
      : k.considering === i
        ? { stroke: 'var(--state-current)', width: 3, dash: '6 5', front: true }
        : k.rejected.includes(i)
          ? { stroke: 'var(--state-reject)', dash: '3 4', dim: true }
          : {};
  const pNode = (n: GNode): NodeLook =>
    p.inTree.includes(n.id) ? { fill: 'var(--state-visited)', ink: '#10172a' } : {};
  const pEdge = (_: GEdge, i: number): EdgeLook =>
    p.tree.includes(i)
      ? { stroke: 'var(--state-path)', width: 4, front: true }
      : p.considering === i
        ? { stroke: 'var(--state-current)', width: 3, dash: '6 5', front: true }
        : {};

  const showK = view !== 'prim';
  const showP = view !== 'kruskal';
  const sorted = EDGES.map((_, i) => i).sort((a, b) => (EDGES[a]?.w ?? 0) - (EDGES[b]?.w ?? 0));

  return (
    <VizShell
      title={L.title}
      subtitle={L.subtitle}
      icon={<Waypoints />}
      onKeyDown={playerKeys(player)}
      toolbar={
        <Field label={L.view}>
          <Segmented
            label={L.view}
            value={view}
            onChange={setView}
            options={(['both', 'kruskal', 'prim'] as const).map((v) => ({ value: v, label: L.views[v] }))}
          />
        </Field>
      }
      footer={
        <>
          {showK && <StepNote text={`**Kruskal:** ${k.note}`} />}
          {showP && <StepNote text={`**Prim:** ${p.note}`} tone="success" />}
          <PlayerBar player={player} />
          <PredictPanel predict={predict} />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className={`grid gap-3 ${showK && showP ? 'lg:grid-cols-2' : ''}`}>
            {showK && (
              <GraphCanvas
                nodes={NODES}
                edges={EDGES}
                width={540}
                height={400}
                nodeLook={kNode}
                edgeLook={kEdge}
                ariaLabel={L.graph('Kruskal')}
                maxHeight="420px"
              />
            )}
            {showP && (
              <GraphCanvas
                nodes={NODES}
                edges={EDGES}
                width={540}
                height={400}
                nodeLook={pNode}
                edgeLook={pEdge}
                ariaLabel={L.graph('Prim')}
                maxHeight="420px"
              />
            )}
          </div>
          <Legend
            items={[
              { color: 'var(--state-path)', label: L.tree, shape: 'line' },
              { color: 'var(--state-current)', label: L.considering, shape: 'dash' },
              { color: 'var(--state-reject)', label: L.rejected, shape: 'dash' },
            ]}
          />
        </div>
        <div className="grid content-start gap-3">
          <div className="grid grid-cols-2 gap-3">
            {showK && <Stat label={L.weightKruskal} value={k.weight} tone="accent" />}
            {showP && <Stat label={L.weightPrim} value={p.weight} tone="success" />}
          </div>
          {showK && (
            <>
              <Panel title={L.edges}>
                <ul className="flex flex-wrap gap-1.5 font-mono text-xs">
                  {sorted.map((i) => {
                    const e = EDGES[i];
                    if (!e) return null;
                    const state = k.tree.includes(i)
                      ? 'border-[var(--state-path)] bg-[color-mix(in_oklab,var(--state-path)_14%,transparent)]'
                      : k.considering === i
                        ? 'border-[var(--state-current)] ring-2 ring-[var(--state-current)]/40'
                        : k.rejected.includes(i)
                          ? 'border-[var(--state-reject)] text-[var(--state-reject)] line-through opacity-70'
                          : 'border-border text-muted';
                    return (
                      <li key={`${e.u}${e.v}`} className={`rounded-md border px-1.5 py-0.5 ${state}`}>
                        {e.u}–{e.v} {e.w}
                      </li>
                    );
                  })}
                </ul>
              </Panel>
              <Panel title={L.forest}>
                <Forest step={k} label={L.forest} />
                <p className="mt-2 text-[0.72rem] text-muted">{L.forestHelp}</p>
              </Panel>
            </>
          )}
        </div>
      </div>
    </VizShell>
  );
}

/** The disjoint-set forest: each set a small tree, roots on top with their rank. */
function Forest({ step, label }: { step: UnionFindStep; label: string }) {
  const ids = NODES.map((n) => n.id);
  const roots = ids.filter((v) => step.parent[v] === v);
  const children = (v: string) => ids.filter((c) => c !== v && step.parent[c] === v);
  // Leaves left to right; each parent above its children.
  const pos = new Map<string, { x: number; depth: number }>();
  let leaf = 0;
  const place = (v: string, depth: number): number => {
    const kids = children(v);
    const x = kids.length ? kids.map((c) => place(c, depth + 1)).reduce((s, n) => s + n, 0) / kids.length : leaf++;
    pos.set(v, { x, depth });
    return x;
  };
  for (const r of roots) {
    place(r, 0);
    leaf += 0.4;
  }
  const maxDepth = Math.max(...[...pos.values()].map((q) => q.depth), 0);
  const w = Math.max(leaf, 1) * 38 + 20;
  const h = (maxDepth + 1) * 46 + 10;
  const at = (v: string) => {
    const q = pos.get(v) ?? { x: 0, depth: 0 };
    return { x: 26 + q.x * 38, y: 22 + q.depth * 46 };
  };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={label}>
      <defs>
        <marker id="uf-arrow" viewBox="0 0 8 8" refX="15" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--viz-line)" />
        </marker>
      </defs>
      {ids.map((v) => {
        const parent = step.parent[v];
        if (!parent || parent === v) return null;
        const a = at(v);
        const b = at(parent);
        const moved = step.moved.includes(v);
        return (
          <line
            key={v}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={moved ? 'var(--state-frontier)' : 'var(--viz-line)'}
            strokeWidth={moved ? 2.5 : 1.5}
            markerEnd="url(#uf-arrow)"
          />
        );
      })}
      {ids.map((v) => {
        const { x, y } = at(v);
        const root = step.parent[v] === v;
        return (
          <g key={v}>
            <circle
              cx={x}
              cy={y}
              r={12}
              fill={
                step.path.includes(v)
                  ? 'color-mix(in oklab, var(--state-current) 25%, var(--surface))'
                  : 'var(--surface)'
              }
              stroke={root ? 'var(--state-current)' : 'var(--viz-line)'}
              strokeWidth={root ? 2.5 : 1.5}
            />
            <text x={x} y={y + 4} textAnchor="middle" className="fill-[var(--foreground)] text-[11px] font-bold">
              {v}
            </text>
            {root && (
              <text x={x} y={y - 16} textAnchor="middle" className="fill-[var(--muted)] font-mono text-[9px]">
                r={step.rank[v]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

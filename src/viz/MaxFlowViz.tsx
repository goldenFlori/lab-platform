import { Button, Chip } from '@heroui/react';
import { Droplets, Eye, Scissors, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type FlowStep, maxflowSteps, residual, type Strategy, separated } from './algorithms/maxflow';
import { layeredLayout } from './algorithms/scc';
import { Choice, Field, PlayerBar, Segmented } from './kit/controls';
import { type EdgeLook, fitLayout, type GEdge, type GNode, GraphCanvas, type NodeLook } from './kit/GraphCanvas';
import { must } from './kit/must';
import { Legend, Panel, Pseudocode, Stat, StepNote, VizShell } from './kit/shell';
import { playerKeys, usePlayer } from './kit/usePlayer';

/* =====================================================================
 *  Rrjedha maksimale / prerja minimale — Leksionet 5–6, Laboratorët 8–9
 *  Presets are the class exercises. Homework networks are deliberately
 *  NOT included, so the tool never gives away a homework answer.
 * ===================================================================== */

interface FlowPreset {
  id: string;
  name: string;
  note: string;
  s: string;
  t: string;
  nodes: GNode[];
  edges: GEdge[];
  pill?: boolean;
}

const W = 760;
const H = 420;
const named = (names: string[], list: number[][]): GEdge[] =>
  list.map(([u, v, w]) => ({ u: names[u], v: names[v], w }));
const placed = (pts: [string, number, number][], flip = true) =>
  fitLayout(
    pts.map(([id, x, y]) => ({ id, x, y })),
    W,
    H,
    60,
    flip,
  );
const auto = (ids: string[], edges: GEdge[]) => fitLayout(layeredLayout(ids, edges, W, H), W, H, 60);

function preset(
  id: string,
  name: string,
  note: string,
  names: string[],
  list: number[][],
  opts: { pts?: [string, number, number][]; pill?: boolean } = {},
): FlowPreset {
  const edges = named(names, list);
  return {
    id,
    name,
    note,
    s: names[0],
    t: names[names.length - 1],
    edges,
    nodes: opts.pts ? placed(opts.pts) : auto(names, edges),
    pill: opts.pill,
  };
}

const C = 40;

export const FLOW_PRESETS: FlowPreset[] = [
  preset(
    'leksioni',
    'Rrjeta e leksionit (slides 26–32)',
    'Greedy ndalon te 16, maksimumi është 19.',
    ['s', '2', '3', '4', '5', 't'],
    [
      [0, 1, 10],
      [0, 2, 10],
      [1, 4, 8],
      [1, 2, 2],
      [1, 3, 4],
      [2, 4, 9],
      [4, 5, 10],
      [4, 3, 6],
      [3, 5, 10],
    ],
    {
      pts: [
        ['s', 0, 0],
        ['2', 1, 1],
        ['3', 1, -1],
        ['4', 2.3, 1],
        ['5', 2.3, -1],
        ['t', 3.3, 0],
      ],
    },
  ),
  preset(
    'romb',
    'Rombi (slide 33)',
    'E vetmja rrjedhë max ka f(u, v) = 0. Greedy gabon nëse zgjedh s → u → v → t.',
    ['s', 'u', 'v', 't'],
    [
      [0, 1, 2],
      [0, 2, 2],
      [1, 2, 1],
      [1, 3, 2],
      [2, 3, 2],
    ],
    {
      pts: [
        ['s', 0, 0],
        ['u', 1, 1],
        ['v', 1, -1],
        ['t', 2, 0],
      ],
    },
  ),
  preset(
    'C',
    `Shembulli me C = ${C} (slides 66–74)`,
    `Me rrugë të zgjedhura keq Ford-Fulkerson bën 2C = ${2 * C} iterime; Edmonds-Karp vetëm 2.`,
    ['s', 'a', 'b', 't'],
    [
      [0, 1, C],
      [0, 2, C],
      [1, 2, 1],
      [1, 3, C],
      [2, 3, C],
    ],
    {
      pts: [
        ['s', 0, 0],
        ['a', 1, 1],
        ['b', 1, -1],
        ['t', 2, 0],
      ],
    },
  ),
  preset(
    'hidranti',
    'Hidranti → depozita (Lab 9, Ush. 1)',
    'Gjeni prerjen me kosto minimale që ndan hidrantin nga depozita.',
    ['Hidranti', 'B-1', 'B-2', 'B-3', 'B-4', 'Depozita'],
    [
      [0, 1, 10],
      [0, 2, 8],
      [1, 3, 6],
      [1, 4, 4],
      [2, 4, 7],
      [3, 5, 9],
      [4, 5, 8],
    ],
    { pill: true },
  ),
  preset(
    'qyteti',
    'Ujësjellësi i qytetit (Lab 9, Ush. 2)',
    'Ford-Fulkerson kundrejt Edmonds-Karp mbi të njëjtin rrjet.',
    ['S', '0', '1', '2', '3', 'T'],
    [
      [0, 1, 10],
      [0, 2, 10],
      [1, 3, 25],
      [2, 4, 15],
      [3, 5, 10],
      [4, 1, 6],
      [4, 5, 10],
    ],
  ),
  preset(
    'datacenter',
    'Data center (Lab 9, Ush. 3)',
    'Sa Gbps kalojnë nga DC te serveri? Cila lidhje është ngushtica?',
    ['DC', 'R-A', 'R-B', 'SW-1', 'SW-2', 'SW-3', 'SRV'],
    [
      [0, 1, 12],
      [0, 2, 15],
      [1, 2, 4],
      [1, 3, 8],
      [1, 4, 7],
      [2, 4, 6],
      [2, 5, 10],
      [3, 4, 3],
      [4, 5, 5],
      [3, 6, 9],
      [4, 6, 12],
      [5, 6, 8],
    ],
    { pill: true },
  ),
  preset(
    'aeroporti',
    'Aeroporti TIA (Lab 9, Ush. 4)',
    'Pasagjerë në minutë nga terminali te bagazhet.',
    ['T-MAIN', 'Gate-A', 'Gate-B', 'Korr-N', 'Korr-S', 'Korr-W', 'Siguria', 'BAGGAGE'],
    [
      [0, 1, 18],
      [0, 2, 14],
      [1, 3, 10],
      [1, 4, 8],
      [2, 4, 9],
      [2, 5, 11],
      [3, 6, 7],
      [4, 6, 13],
      [5, 6, 6],
      [3, 7, 8],
      [4, 7, 10],
      [6, 7, 15],
    ],
    { pill: true },
  ),
  preset(
    'centrali',
    'Centrali → qyteti (Pipeline Defender)',
    'Ndërpritni furnizimin me koston më të vogël.',
    ['Centrali', 'NS-A', 'NS-B', 'NS-C', 'TR-1', 'TR-2', 'TR-3', 'Qyteti'],
    [
      [0, 1, 15],
      [0, 2, 12],
      [0, 3, 10],
      [1, 2, 5],
      [1, 4, 10],
      [1, 5, 8],
      [2, 3, 4],
      [2, 5, 9],
      [2, 6, 7],
      [3, 6, 11],
      [3, 7, 6],
      [4, 5, 3],
      [4, 7, 12],
      [5, 6, 6],
      [5, 7, 9],
      [6, 7, 14],
    ],
    { pill: true },
  ),
  preset(
    'ujesjellesi',
    'Ujësjellësi në emergjencë (Lab 8, Ush. 3)',
    'Edmonds-Karp: sa ujë arrin te qendra e emergjencës?',
    ['Rezervuari', 'SP-A', 'SP-B', 'SP-C', 'L-1', 'L-2', 'L-3', 'L-4', 'QE'],
    [
      [0, 1, 20],
      [0, 2, 15],
      [0, 3, 12],
      [1, 4, 14],
      [1, 5, 10],
      [2, 4, 8],
      [2, 5, 12],
      [2, 6, 7],
      [3, 5, 9],
      [3, 6, 11],
      [3, 7, 6],
      [4, 5, 5],
      [5, 6, 4],
      [6, 7, 6],
      [4, 8, 15],
      [5, 8, 13],
      [6, 8, 11],
      [7, 8, 9],
    ],
    { pill: true },
  ),
];

const STRATS: { value: Strategy; label: string }[] = [
  { value: 'ek', label: 'Edmonds-Karp (BFS)' },
  { value: 'ff', label: 'Ford-Fulkerson (DFS)' },
  { value: 'greedy', label: 'Greedy' },
  { value: 'adversary', label: 'Kundërshtari' },
];

const soft = (c: string, p = 24) => `color-mix(in oklab, ${c} ${p}%, var(--surface))`;

export default function MaxFlowViz({
  preset: initial = 'leksioni',
  strategy: initialStrategy = 'ek',
  mode: initialMode = 'algo',
}: {
  preset?: string;
  strategy?: Strategy;
  mode?: 'algo' | 'cut';
}) {
  const p0 = FLOW_PRESETS.find((p) => p.id === initial) ?? FLOW_PRESETS[0];
  const [presetId, setPresetId] = useState(p0.id);
  const net = must(
    FLOW_PRESETS.find((p) => p.id === presetId),
    'preset',
  );
  const [nodes, setNodes] = useState<GNode[]>(p0.nodes);
  const [strategy, setStrategy] = useState<Strategy>(initialStrategy);
  const [mode, setMode] = useState<'algo' | 'cut'>(initialMode);
  const [view, setView] = useState<'G' | 'Gf'>('G');
  const [removed, setRemoved] = useState<Set<number>>(new Set());

  const load = (id: string) => {
    const p = must(
      FLOW_PRESETS.find((x) => x.id === id),
      'preset',
    );
    setPresetId(id);
    setNodes(p.nodes);
    setRemoved(new Set());
  };

  const steps = useMemo<FlowStep[]>(() => maxflowSteps(net.nodes, net.edges, net.s, net.t, strategy), [net, strategy]);
  const best = useMemo(() => {
    const st = maxflowSteps(net.nodes, net.edges, net.s, net.t, 'ek');
    return st[st.length - 1];
  }, [net]);
  const player = usePlayer(steps, strategy === 'adversary' ? 450 : 1100);
  const s = player.step;
  const done = s.phase === 'done';
  const cutS = new Set(done ? s.cutS : []);

  /* ---------------- G view ---------------- */
  const pathEdges = new Map<number, boolean>(); // ei -> back?
  if (s.phase === 'path' || s.phase === 'augment') for (const a of s.path) pathEdges.set(a.ei, a.back);
  const bottleneckEi = s.bottleneck !== null && s.path[s.bottleneck] ? s.path[s.bottleneck].ei : -1;

  const gEdgeLook = (e: GEdge, i: number): EdgeLook => {
    const c = e.w ?? 0;
    const f = s.flow[i];
    const label = `${f}/${c}`;
    if (done && cutS.has(e.u) && !cutS.has(e.v))
      return { stroke: 'var(--viz-reject)', width: 5, label: `✂ ${label}`, labelTone: 'danger', front: true };
    if (pathEdges.has(i)) {
      const back = pathEdges.get(i);
      return {
        stroke: back ? 'var(--viz-compare)' : 'var(--viz-active)',
        width: 5,
        dash: back ? '7 5' : undefined,
        label: s.phase === 'augment' ? `${label} (${back ? '−' : '+'}${s.x})` : label,
        labelTone: i === bottleneckEi ? 'warning' : back ? 'warning' : 'accent',
        front: true,
      };
    }
    if (f === 0) return { label, labelTone: 'muted' };
    return {
      stroke: f === c ? 'var(--viz-reject)' : 'var(--viz-path)',
      width: 2 + (3 * f) / Math.max(c, 1),
      animated: true,
      label,
      labelTone: f === c ? 'danger' : 'default',
    };
  };

  /* ---------------- G_f view ---------------- */
  const rArcs = useMemo(() => residual(net.edges, s.flow), [net, s.flow]);
  const rEdges: GEdge[] = rArcs.map((a) => ({ u: a.u, v: a.v, w: a.cap }));
  const onPath = (a: { ei: number; back: boolean }) =>
    (s.phase === 'path' || s.phase === 'augment') && s.path.some((p) => p.ei === a.ei && p.back === a.back);
  const rEdgeLook = (_: GEdge, i: number): EdgeLook => {
    const a = rArcs[i];
    if (onPath(a) && s.phase === 'path')
      return {
        stroke: 'var(--viz-active)',
        width: 5,
        front: true,
        label: String(a.cap),
        labelTone: 'accent',
        dash: a.back ? '7 5' : undefined,
      };
    return a.back
      ? { stroke: 'var(--viz-compare)', dash: '6 5', label: String(a.cap), labelTone: 'warning' }
      : { label: String(a.cap) };
  };

  /* ---------------- cut game ---------------- */
  const cut = useMemo(() => separated(net.edges, removed, net.s, net.t), [net, removed]);
  const cost = [...removed].reduce((sum, i) => sum + (net.edges[i].w ?? 0), 0);
  const optimal = cut.separated && cost === best.value;
  const toggleCut = (i: number) => {
    const next = new Set(removed);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setRemoved(next);
  };
  const showMinCut = () => {
    const S = new Set(best.cutS);
    setRemoved(new Set(net.edges.map((e, i) => (S.has(e.u) && !S.has(e.v) ? i : -1)).filter((i) => i >= 0)));
  };
  const cutEdgeLook = (e: GEdge, i: number): EdgeLook =>
    removed.has(i)
      ? { stroke: 'var(--viz-reject)', width: 3, dash: '4 6', label: `✂ ${e.w}`, labelTone: 'danger', front: true }
      : cut.reach.has(e.u) && cut.reach.has(e.v)
        ? { stroke: 'var(--viz-path)', width: 3, animated: !cut.separated, label: String(e.w) }
        : { label: String(e.w), labelTone: 'muted' };

  const nodeLook = (n: GNode): NodeLook => {
    const isS = n.id === net.s,
      isT = n.id === net.t;
    const sSide = mode === 'cut' ? cut.reach.has(n.id) : done && cutS.has(n.id);
    return {
      fill: isS
        ? soft('var(--viz-done)', 32)
        : isT
          ? soft('var(--viz-reject)', 28)
          : sSide
            ? soft('var(--brand)', 20)
            : undefined,
      stroke: isS ? 'var(--viz-done)' : isT ? 'var(--viz-reject)' : sSide ? 'var(--brand)' : undefined,
      strokeWidth: isS || isT ? 3 : 2,
      ring:
        mode === 'algo' &&
        s.phase === 'path' &&
        s.path.length &&
        (s.path[0].u === n.id || s.path.some((a) => a.v === n.id))
          ? 'var(--viz-active)'
          : undefined,
    };
  };

  const shape = net.pill ? 'pill' : 'circle';

  return (
    <VizShell
      title="Rrjedha maksimale dhe prerja minimale"
      subtitle="Ford-Fulkerson: sa kohë ka rrugë rritëse në rrjetën mbetëse, rrit rrjedhën. Kur s’ka më, kulmet e arritshme japin prerjen minimale."
      icon={<Droplets />}
      onKeyDown={mode === 'algo' ? playerKeys(player) : undefined}
      toolbar={
        <>
          <Field label="Mënyra">
            <Segmented
              label="Mënyra"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'algo', label: 'Algoritmi', icon: <Droplets className="size-4" /> },
                { value: 'cut', label: 'Gjej prerjen min', icon: <Scissors className="size-4" /> },
              ]}
            />
          </Field>
          <Field label="Rrjeti">
            <Choice
              label="Rrjeti"
              value={presetId}
              onChange={load}
              options={FLOW_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
              className="w-72"
            />
          </Field>
          {mode === 'algo' && (
            <>
              <Field label="Strategjia e rrugës">
                <Choice label="Strategjia" value={strategy} onChange={setStrategy} options={STRATS} className="w-56" />
              </Field>
              <Field label="Shfaq">
                <Segmented
                  label="Pamja"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'G', label: 'Rrjeta G (f/c)' },
                    { value: 'Gf', label: 'Mbetëse G_f' },
                  ]}
                />
              </Field>
            </>
          )}
        </>
      }
      footer={
        mode === 'algo' ? (
          <>
            <StepNote text={s.note} tone={done ? 'success' : s.phase === 'stuck' ? 'danger' : 'accent'} />
            <PlayerBar player={player} />
          </>
        ) : (
          <StepNote
            tone={optimal ? 'success' : cut.separated ? 'warning' : 'accent'}
            text={
              removed.size === 0
                ? `Klikoni tubat (brinjët) për t’i prerë. Qëllimi: të ndani **${net.s}** nga **${net.t}** me koston më të vogël.`
                : !cut.separated
                  ? `Rrjedha ende kalon: ${net.t} arrihet nga ${net.s}. Kosto deri tani: ${cost}.`
                  : optimal
                    ? `**Prerje minimale!** Kosto = ${cost} = rrjedha maksimale. Teorema rrjedhë-max = prerje-min në veprim.`
                    : `Prerje e vlefshme me kosto **${cost}** — por ka një më të lirë. Çdo prerje ka kosto ≥ rrjedha max = ${best.value}.`
            }
          />
        )
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          {mode === 'cut' && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="tertiary" onPress={showMinCut}>
                <Eye /> Trego prerjen minimale
              </Button>
              <Button size="sm" variant="ghost" isDisabled={!removed.size} onPress={() => setRemoved(new Set())}>
                <Trash2 /> Pastro
              </Button>
            </div>
          )}
          <div className="rounded-2xl border border-border bg-[var(--viz-canvas)] bg-grid">
            {mode === 'algo' && view === 'Gf' ? (
              <GraphCanvas
                nodes={nodes}
                edges={rEdges}
                directed
                width={W}
                height={H}
                shape={shape}
                nodeLook={nodeLook}
                edgeLook={rEdgeLook}
                onNodeMove={(id, x, y) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x, y } : n)))}
                ariaLabel="Rrjeta mbetëse"
              />
            ) : (
              <GraphCanvas
                nodes={nodes}
                edges={net.edges}
                directed
                width={W}
                height={H}
                shape={shape}
                nodeLook={nodeLook}
                edgeLook={mode === 'cut' ? cutEdgeLook : gEdgeLook}
                onEdgeClick={mode === 'cut' ? toggleCut : undefined}
                onNodeMove={(id, x, y) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x, y } : n)))}
                ariaLabel={`Rrjeta rrjedhë: ${net.name}`}
              />
            )}
          </div>
          {mode === 'algo' ? (
            view === 'G' ? (
              <Legend
                items={[
                  { color: 'var(--viz-active)', label: 'Rruga rritëse', shape: 'line' },
                  { color: 'var(--viz-compare)', label: 'Brinjë kthyese në rrugë (−x)', shape: 'dash' },
                  { color: 'var(--viz-path)', label: 'Mbart rrjedhë', shape: 'line' },
                  { color: 'var(--viz-reject)', label: 'E ngopur f = c', shape: 'line' },
                ]}
              />
            ) : (
              <Legend
                items={[
                  { color: 'var(--viz-line)', label: 'Brinjë e drejtë: c − f', shape: 'line' },
                  { color: 'var(--viz-compare)', label: 'Brinjë kthyese: f', shape: 'dash' },
                  { color: 'var(--viz-active)', label: 'Rruga rritëse', shape: 'line' },
                ]}
              />
            )
          ) : (
            <Legend
              items={[
                { color: 'var(--brand)', label: 'Ana S (arrihet nga burimi)' },
                { color: 'var(--viz-reject)', label: 'Brinjë e prerë', shape: 'dash' },
              ]}
            />
          )}
          <p className="text-xs text-muted">{net.note}</p>
        </div>

        <div className="grid min-w-0 content-start gap-3">
          {mode === 'algo' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Vlera v(f)" value={s.value} tone="success" />
                <Stat label="Iterime" value={s.iteration} />
              </div>
              <Panel title="Ford-Fulkerson (slide 47)">
                <Pseudocode
                  lines={[
                    'f ← 0;  G_f ← G',
                    'while t arrihet nga s në G_f:',
                    '  P = rrugë s→t në G_f',
                    '  f = rritRrjedhë(P, f)',
                    '  rinovo G_f',
                    'return f',
                  ]}
                  active={s.phase === 'init' ? 0 : s.phase === 'path' ? 2 : s.phase === 'augment' ? 3 : 5}
                />
              </Panel>
              <Panel title={`Rrugët rritëse (${s.history.length})`}>
                {s.history.length === 0 ? (
                  <p className="text-sm text-muted">Ende asnjë.</p>
                ) : (
                  <ol className="max-h-56 space-y-1 overflow-y-auto font-mono text-[0.74rem]">
                    {s.history.map((h, k) => (
                      <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: the history only grows; k is the iteration
                        key={k}
                        className="flex justify-between gap-2"
                      >
                        <span className="truncate">
                          {k + 1}. {h.path}
                        </span>
                        <span className="shrink-0 font-semibold text-success">+{h.x}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat
                  label="Kosto e prerjes"
                  value={cost}
                  tone={optimal ? 'success' : cut.separated ? 'warning' : 'default'}
                />
                <Stat label="Rrjedha max" value={best.value} tone="accent" />
              </div>
              <Panel title="Statusi">
                <div className="flex flex-wrap gap-1.5">
                  <Chip size="sm" variant="soft" color={cut.separated ? 'success' : 'danger'}>
                    {cut.separated ? `${net.s} dhe ${net.t} të ndarë` : `${net.t} ende arrihet`}
                  </Chip>
                  {optimal && (
                    <Chip size="sm" variant="soft" color="success">
                      prerje minimale ✓
                    </Chip>
                  )}
                </div>
                <p className="mt-2.5 text-sm text-muted">
                  Kapaciteti i një prerjeje numëron vetëm brinjët <b className="text-foreground">nga S te T</b>. Lema 1
                  (dualiteti i dobët): v(f) ≤ c(S, T) për çdo rrjedhë dhe çdo prerje.
                </p>
              </Panel>
            </>
          )}
        </div>
      </div>
    </VizShell>
  );
}

import { Button, Chip } from '@heroui/react';
import { Droplets, Eye, Scissors, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type FlowStep, maxflowSteps, residual, type Strategy, separated } from './algorithms/maxflow';
import { MAXFLOW_TEXT } from './algorithms/maxflow.text';
import { layeredLayout } from './algorithms/scc';
import { Choice, Field, PlayerBar, Segmented } from './kit/controls';
import { type EdgeLook, fitLayout, type GEdge, type GNode, GraphCanvas, type NodeLook } from './kit/GraphCanvas';
import { must } from './kit/must';
import { Legend, Panel, Pseudocode, Stat, StepNote, VizShell } from './kit/shell';
import { bilingual, useText } from './kit/text';
import { playerKeys, usePlayer } from './kit/usePlayer';

/* =====================================================================
 *  Rrjedha maksimale / prerja minimale — Leksionet 5–6, Laboratorët 8–9
 *  Presets are the class exercises. Homework networks are deliberately
 *  NOT included, so the tool never gives away a homework answer.
 * ===================================================================== */

interface FlowPreset {
  id: string;
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
  names: string[],
  list: number[][],
  opts: { pts?: [string, number, number][]; pill?: boolean } = {},
): FlowPreset {
  const edges = named(names, list);
  return {
    id,
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
  { value: 'adversary', label: 'adversary' },
];

const soft = (c: string, p = 24) => `color-mix(in oklab, ${c} ${p}%, var(--surface))`;

const TEXT = bilingual(
  {
    presets: {
      leksioni: { name: 'Rrjeta e leksionit (slides 26–32)', note: 'Greedy ndalon te 16, maksimumi është 19.' },
      romb: {
        name: 'Rombi (slide 33)',
        note: 'E vetmja rrjedhë max ka f(u, v) = 0. Greedy gabon nëse zgjedh s → u → v → t.',
      },
      C: {
        name: `Shembulli me C = ${C} (slides 66–74)`,
        note: `Me rrugë të zgjedhura keq Ford-Fulkerson bën 2C = ${2 * C} iterime; Edmonds-Karp vetëm 2.`,
      },
      hidranti: {
        name: 'Hidranti → depozita (Lab 9, Ush. 1)',
        note: 'Gjeni prerjen me kosto minimale që ndan hidrantin nga depozita.',
      },
      qyteti: {
        name: 'Ujësjellësi i qytetit (Lab 9, Ush. 2)',
        note: 'Ford-Fulkerson kundrejt Edmonds-Karp mbi të njëjtin rrjet.',
      },
      datacenter: {
        name: 'Data center (Lab 9, Ush. 3)',
        note: 'Sa Gbps kalojnë nga DC te serveri? Cila lidhje është ngushtica?',
      },
      aeroporti: { name: 'Aeroporti TIA (Lab 9, Ush. 4)', note: 'Pasagjerë në minutë nga terminali te bagazhet.' },
      centrali: { name: 'Centrali → qyteti (Pipeline Defender)', note: 'Ndërpritni furnizimin me koston më të vogël.' },
      ujesjellesi: {
        name: 'Ujësjellësi në emergjencë (Lab 8, Ush. 3)',
        note: 'Edmonds-Karp: sa ujë arrin te qendra e emergjencës?',
      },
    } as Record<string, { name: string; note: string }>,
    adversary: 'Kundërshtari',
    title: 'Rrjedha maksimale dhe prerja minimale',
    subtitle:
      'Ford-Fulkerson: sa kohë ka rrugë rritëse në rrjetën mbetëse, rrit rrjedhën. Kur s’ka më, kulmet e arritshme japin prerjen minimale.',
    mode: 'Mënyra',
    algorithm: 'Algoritmi',
    findCut: 'Gjej prerjen min',
    network: 'Rrjeti',
    pathStrategy: 'Strategjia e rrugës',
    strategy: 'Strategjia',
    show: 'Shfaq',
    view: 'Pamja',
    graphG: 'Rrjeta G (f/c)',
    residualGf: 'Mbetëse G_f',
    cutStart: (s: string, t: string) =>
      `Klikoni tubat (brinjët) për t’i prerë. Qëllimi: të ndani **${s}** nga **${t}** me koston më të vogël.`,
    stillFlows: (s: string, t: string, cost: number) =>
      `Rrjedha ende kalon: ${t} arrihet nga ${s}. Kosto deri tani: ${cost}.`,
    minCut: (cost: number) =>
      `**Prerje minimale!** Kosto = ${cost} = rrjedha maksimale. Teorema rrjedhë-max = prerje-min në veprim.`,
    validCut: (cost: number, max: number) =>
      `Prerje e vlefshme me kosto **${cost}** — por ka një më të lirë. Çdo prerje ka kosto ≥ rrjedha max = ${max}.`,
    residual: 'Rrjeta mbetëse',
    flowNetwork: (name: string) => `Rrjeta rrjedhë: ${name}`,
    augmenting: 'Rruga rritëse',
    backOnPath: 'Brinjë kthyese në rrugë (−x)',
    carries: 'Mbart rrjedhë',
    saturated: 'E ngopur f = c',
    forward: 'Brinjë e drejtë: c − f',
    backward: 'Brinjë kthyese: f',
    sideS: 'Ana S (arrihet nga burimi)',
    cutEdge: 'Brinjë e prerë',
    value: 'Vlera v(f)',
    iterations: 'Iterime',
    pseudo: [
      'f ← 0;  G_f ← G',
      'while t arrihet nga s në G_f:',
      '  P = rrugë s→t në G_f',
      '  f = rritRrjedhë(P, f)',
      '  rinovo G_f',
      'return f',
    ],
    paths: (n: number) => `Rrugët rritëse (${n})`,
    none: 'Ende asnjë.',
    cutCost: 'Kosto e prerjes',
    maxFlow: 'Rrjedha max',
    status: 'Statusi',
    separated: (s: string, t: string) => `${s} dhe ${t} të ndarë`,
    reachable: (t: string) => `${t} ende arrihet`,
    minimal: 'prerje minimale ✓',
    capacityStart: 'Kapaciteti i një prerjeje numëron vetëm brinjët',
    fromStoT: 'nga S te T',
    capacityEnd: 'Lema 1 (dualiteti i dobët): v(f) ≤ c(S, T) për çdo rrjedhë dhe çdo prerje.',
  },
  {
    presets: {
      leksioni: { name: 'The lecture’s network (slides 26–32)', note: 'Greedy stops at 16; the maximum is 19.' },
      romb: {
        name: 'The diamond (slide 33)',
        note: 'The only max flow has f(u, v) = 0. Greedy goes wrong if it picks s → u → v → t.',
      },
      C: {
        name: `The example with C = ${C} (slides 66–74)`,
        note: `With badly chosen paths Ford-Fulkerson makes 2C = ${2 * C} iterations; Edmonds-Karp only 2.`,
      },
      hidranti: {
        name: 'Hydrant → reservoir (Lab 9, Ex. 1)',
        note: 'Find the cheapest cut that separates the hydrant from the reservoir.',
      },
      qyteti: {
        name: 'The city water supply (Lab 9, Ex. 2)',
        note: 'Ford-Fulkerson versus Edmonds-Karp on the same network.',
      },
      datacenter: {
        name: 'Data center (Lab 9, Ex. 3)',
        note: 'How many Gbps get from the DC to the server? Which link is the bottleneck?',
      },
      aeroporti: {
        name: 'TIA airport (Lab 9, Ex. 4)',
        note: 'Passengers per minute from the terminal to the baggage hall.',
      },
      centrali: { name: 'Power plant → city (Pipeline Defender)', note: 'Cut the supply at the lowest cost.' },
      ujesjellesi: {
        name: 'Water supply in an emergency (Lab 8, Ex. 3)',
        note: 'Edmonds-Karp: how much water reaches the emergency centre?',
      },
    },
    adversary: 'Adversary',
    title: 'Maximum flow and minimum cut',
    subtitle:
      'Ford-Fulkerson: while the residual network has an augmenting path, push flow. When there are none, the reachable vertices give the minimum cut.',
    mode: 'Mode',
    algorithm: 'Algorithm',
    findCut: 'Find the min cut',
    network: 'Network',
    pathStrategy: 'Path strategy',
    strategy: 'Strategy',
    show: 'Show',
    view: 'View',
    graphG: 'Network G (f/c)',
    residualGf: 'Residual G_f',
    cutStart: (s, t) =>
      `Click the pipes (edges) to cut them. The goal: separate **${s}** from **${t}** at the lowest cost.`,
    stillFlows: (s, t, cost) => `Flow still gets through: ${t} is reachable from ${s}. Cost so far: ${cost}.`,
    minCut: (cost) => `**Minimum cut!** Cost = ${cost} = the maximum flow. The max-flow = min-cut theorem in action.`,
    validCut: (cost, max) =>
      `A valid cut costing **${cost}** — but there is a cheaper one. Every cut costs ≥ the max flow = ${max}.`,
    residual: 'Residual network',
    flowNetwork: (name) => `Flow network: ${name}`,
    augmenting: 'Augmenting path',
    backOnPath: 'Back edge on the path (−x)',
    carries: 'Carries flow',
    saturated: 'Saturated f = c',
    forward: 'Forward edge: c − f',
    backward: 'Back edge: f',
    sideS: 'Side S (reachable from the source)',
    cutEdge: 'Cut edge',
    value: 'Value v(f)',
    iterations: 'Iterations',
    pseudo: [
      'f ← 0;  G_f ← G',
      'while t is reachable from s in G_f:',
      '  P = path s→t in G_f',
      '  f = augment(P, f)',
      '  update G_f',
      'return f',
    ],
    paths: (n) => `Augmenting paths (${n})`,
    none: 'None yet.',
    cutCost: 'Cut cost',
    maxFlow: 'Max flow',
    status: 'Status',
    separated: (s, t) => `${s} and ${t} separated`,
    reachable: (t) => `${t} still reachable`,
    minimal: 'minimum cut ✓',
    capacityStart: 'A cut’s capacity counts only the edges',
    fromStoT: 'from S to T',
    capacityEnd: 'Lemma 1 (weak duality): v(f) ≤ c(S, T) for every flow and every cut.',
  },
);

export default function MaxFlowViz({
  preset: initial = 'leksioni',
  strategy: initialStrategy = 'ek',
  mode: initialMode = 'algo',
}: {
  preset?: string;
  strategy?: Strategy;
  mode?: 'algo' | 'cut';
}) {
  const X = useText(TEXT);
  const M = useText(MAXFLOW_TEXT);
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

  const steps = useMemo<FlowStep[]>(
    () => maxflowSteps(net.nodes, net.edges, net.s, net.t, strategy, undefined, undefined, undefined, M),
    [net, strategy, M],
  );
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
      title={X.title}
      subtitle={X.subtitle}
      icon={<Droplets />}
      onKeyDown={mode === 'algo' ? playerKeys(player) : undefined}
      toolbar={
        <>
          <Field label={X.mode}>
            <Segmented
              label={X.mode}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'algo', label: X.algorithm, icon: <Droplets className="size-4" /> },
                { value: 'cut', label: X.findCut, icon: <Scissors className="size-4" /> },
              ]}
            />
          </Field>
          <Field label={X.network}>
            <Choice
              label={X.network}
              value={presetId}
              onChange={load}
              options={FLOW_PRESETS.map((p) => ({ value: p.id, label: X.presets[p.id]?.name ?? p.id }))}
              className="w-72"
            />
          </Field>
          {mode === 'algo' && (
            <>
              <Field label={X.pathStrategy}>
                <Choice
                  label={X.strategy}
                  value={strategy}
                  onChange={setStrategy}
                  options={STRATS.map((o) => (o.value === 'adversary' ? { ...o, label: X.adversary } : o))}
                  className="w-56"
                />
              </Field>
              <Field label={X.show}>
                <Segmented
                  label={X.view}
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'G', label: X.graphG },
                    { value: 'Gf', label: X.residualGf },
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
                ? X.cutStart(net.s, net.t)
                : !cut.separated
                  ? X.stillFlows(net.s, net.t, cost)
                  : optimal
                    ? X.minCut(cost)
                    : X.validCut(cost, best.value)
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
                ariaLabel={X.residual}
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
                ariaLabel={X.flowNetwork(X.presets[net.id]?.name ?? net.id)}
              />
            )}
          </div>
          {mode === 'algo' ? (
            view === 'G' ? (
              <Legend
                items={[
                  { color: 'var(--viz-active)', label: X.augmenting, shape: 'line' },
                  { color: 'var(--viz-compare)', label: X.backOnPath, shape: 'dash' },
                  { color: 'var(--viz-path)', label: X.carries, shape: 'line' },
                  { color: 'var(--viz-reject)', label: X.saturated, shape: 'line' },
                ]}
              />
            ) : (
              <Legend
                items={[
                  { color: 'var(--viz-line)', label: X.forward, shape: 'line' },
                  { color: 'var(--viz-compare)', label: X.backward, shape: 'dash' },
                  { color: 'var(--viz-active)', label: X.augmenting, shape: 'line' },
                ]}
              />
            )
          ) : (
            <Legend
              items={[
                { color: 'var(--brand)', label: X.sideS },
                { color: 'var(--viz-reject)', label: X.cutEdge, shape: 'dash' },
              ]}
            />
          )}
          <p className="text-xs text-muted">{X.presets[net.id]?.note}</p>
        </div>

        <div className="grid min-w-0 content-start gap-3">
          {mode === 'algo' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat label={X.value} value={s.value} tone="success" />
                <Stat label={X.iterations} value={s.iteration} />
              </div>
              <Panel title="Ford-Fulkerson (slide 47)">
                <Pseudocode
                  lines={X.pseudo}
                  active={s.phase === 'init' ? 0 : s.phase === 'path' ? 2 : s.phase === 'augment' ? 3 : 5}
                />
              </Panel>
              <Panel title={X.paths(s.history.length)}>
                {s.history.length === 0 ? (
                  <p className="text-sm text-muted">{X.none}</p>
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
                  label={X.cutCost}
                  value={cost}
                  tone={optimal ? 'success' : cut.separated ? 'warning' : 'default'}
                />
                <Stat label={X.maxFlow} value={best.value} tone="accent" />
              </div>
              <Panel title={X.status}>
                <div className="flex flex-wrap gap-1.5">
                  <Chip size="sm" variant="soft" color={cut.separated ? 'success' : 'danger'}>
                    {cut.separated ? X.separated(net.s, net.t) : X.reachable(net.t)}
                  </Chip>
                  {optimal && (
                    <Chip size="sm" variant="soft" color="success">
                      {X.minimal}
                    </Chip>
                  )}
                </div>
                <p className="mt-2.5 text-sm text-muted">
                  {X.capacityStart} <b className="text-foreground">{X.fromStoT}</b>. {X.capacityEnd}
                </p>
              </Panel>
            </>
          )}
        </div>
      </div>
    </VizShell>
  );
}

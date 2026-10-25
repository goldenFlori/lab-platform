import { Button, Chip } from '@heroui/react';
import { Eye, EyeOff, GitBranch, ListOrdered, Shuffle, Trash2, Undo2, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { natural } from './algorithms/graphs';
import { PREDICT_TEXT } from './algorithms/predict.text';
import { allOrders, available, hasCycle, layeredLayout, reach, type SccStep, sccSteps } from './algorithms/scc';
import { SCC_TEXT } from './algorithms/scc.text';
import { Choice, Field, PlayerBar, Segmented, Toggle } from './kit/controls';
import { fitLayout, type GEdge, type GNode, GraphCanvas, type NodeLook } from './kit/GraphCanvas';
import { must } from './kit/must';
import { Legend, Panel, Pseudocode, StepNote, TokenRow, VizShell } from './kit/shell';
import { bilingual, useText } from './kit/text';
import { playerKeys, usePlayer } from './kit/usePlayer';

/* =====================================================================
 *  Komponentet e lidhura fort & renditjet topologjike — Laboratori 6
 * ===================================================================== */

const W = 720;
const H = 400;
const lay = (pts: [string, number, number][]) =>
  fitLayout(
    pts.map(([id, x, y]) => ({ id, x, y })),
    W,
    H,
    60,
  );
const arcs = (list: string[][]): GEdge[] => list.map(([u, v]) => ({ u, v }));

const SCC_PRESETS = [
  {
    id: 'lab',
    nodes: lay([
      ['a', 60, 60],
      ['b', 200, 150],
      ['c', 60, 240],
      ['d', 360, 150],
      ['e', 500, 60],
      ['f', 500, 240],
      ['g', 660, 150],
      ['h', 800, 150],
    ]),
    edges: arcs([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
      ['b', 'd'],
      ['d', 'e'],
      ['e', 'f'],
      ['f', 'd'],
      ['g', 'f'],
      ['g', 'h'],
      ['h', 'g'],
    ]),
  },
  {
    id: 'kater',
    nodes: lay([
      ['1', 60, 80],
      ['2', 200, 40],
      ['3', 200, 200],
      ['4', 360, 120],
      ['5', 500, 40],
      ['6', 500, 200],
      ['7', 660, 120],
      ['8', 800, 40],
      ['9', 800, 200],
    ]),
    edges: arcs([
      ['1', '2'],
      ['2', '3'],
      ['3', '1'],
      ['3', '4'],
      ['4', '5'],
      ['5', '6'],
      ['6', '4'],
      ['6', '7'],
      ['7', '8'],
      ['8', '9'],
      ['9', '7'],
      ['5', '8'],
    ]),
  },
  {
    id: 'cikel',
    nodes: lay([
      ['A', 200, 60],
      ['B', 460, 60],
      ['C', 460, 300],
      ['D', 200, 300],
    ]),
    edges: arcs([
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'D'],
      ['D', 'A'],
      ['A', 'C'],
    ]),
  },
  { id: 'bosh', nodes: [] as GNode[], edges: [] as GEdge[] },
];

const dag = (ids: string[], edges: string[][]) => {
  const e = arcs(edges);
  return { nodes: layeredLayout(ids, e, W, H) as GNode[], edges: e };
};

const TOPO_PRESETS = [
  {
    id: 'lendet',
    ...dag(
      ['MAT1', 'MAT2', 'ALG1', 'PRG1', 'PRG2', 'DB', 'OS', 'NET'],
      [
        ['MAT1', 'MAT2'],
        ['MAT1', 'PRG1'],
        ['MAT2', 'ALG1'],
        ['PRG1', 'PRG2'],
        ['ALG1', 'DB'],
        ['PRG2', 'DB'],
        ['PRG2', 'OS'],
        ['DB', 'NET'],
        ['OS', 'NET'],
      ],
    ),
  },
  {
    id: 'shtepia',
    ...dag(
      ['Themeli', 'Muret', 'Çatia', 'Elektrike', 'Hidraulike', 'Suvatim', 'Lyerja'],
      [
        ['Themeli', 'Muret'],
        ['Muret', 'Çatia'],
        ['Muret', 'Elektrike'],
        ['Muret', 'Hidraulike'],
        ['Çatia', 'Suvatim'],
        ['Elektrike', 'Suvatim'],
        ['Hidraulike', 'Suvatim'],
        ['Suvatim', 'Lyerja'],
      ],
    ),
  },
  {
    id: 'pasta',
    ...dag(
      ['Bli pastë', 'Ziej ujin', 'Shto pastën', 'Bëj salcën', 'Kulloje', 'Shto salcën', 'Shpërndaj'],
      [
        ['Bli pastë', 'Ziej ujin'],
        ['Ziej ujin', 'Shto pastën'],
        ['Shto pastën', 'Kulloje'],
        ['Bëj salcën', 'Shto salcën'],
        ['Kulloje', 'Shto salcën'],
        ['Shto salcën', 'Shpërndaj'],
      ],
    ),
  },
];

const COMP_COLORS = [
  'var(--viz-active)',
  'var(--viz-done)',
  'var(--viz-compare)',
  'var(--viz-path)',
  'var(--brand-3)',
  'var(--viz-reject)',
  'oklch(0.62 0.12 120)',
  'oklch(0.55 0.13 30)',
];
const soft = (c: string, p = 24) => `color-mix(in oklab, ${c} ${p}%, var(--surface))`;

const TEXT = bilingual(
  {
    sccPresets: {
      lab: 'Tre komponente',
      kater: 'Katër komponente (slide 73)',
      cikel: 'Një cikël — i lidhur fort',
      bosh: 'Digraf bosh',
    } as Record<string, string>,
    topoPresets: {
      lendet: { name: 'Lëndët universitare', desc: 'Cila lëndë kërkon cilën?' },
      shtepia: { name: 'Ndërto shtëpinë', desc: 'Cilin hap para cilit?' },
      pasta: { name: 'Gatuaj pastë', desc: 'Cili hap vjen para cilit?' },
    } as Record<string, { name: string; desc: string }>,
    /** Display names of the steps; the course codes (MAT1, PRG1…) are the same in both languages. */
    steps: {} as Record<string, string>,
    already: (id: string) => `**${id}** është vendosur tashmë.`,
    notYet: (id: string, missing: string) => `**${id}** nuk mund të vendoset ende: kërkon më parë ${missing}.`,
    sccTitle: 'Komponentet e lidhura fort (SCC)',
    topoTitle: 'Renditjet topologjike',
    sccSubtitle:
      'Dy kulme janë në të njëjtën komponente kur secili arrin tjetrin. Ndërtoni digrafin tuaj ose zgjidhni një shembull.',
    topoSubtitle: 'Vendosni kulmet me radhë: lejohet vetëm një kulm që i ka të gjithë paraardhësit të vendosur.',
    mode: 'Mënyra',
    topoMode: 'Renditja topologjike',
    digraph: 'Digrafi',
    scenario: 'Skenari',
    valid: (order: string, mistakes: number, count: number) =>
      `**Renditje e vlefshme!** ${order}. Gabime: ${mistakes}. Gjithsej ekzistojnë **${count}** renditje topologjike — provoni të gjeni një tjetër.`,
    start: (desc: string) => `${desc} Kulmet me rreth lëvizës nuk kanë paraardhës të pavendosur — zgjidhni njërin.`,
    available: (list: string, placed: number, total: number) =>
      `Të disponueshme tani: **${list}**. Vendosur: ${placed}/${total}.`,
    clear: 'Pastro',
    editHelp: 'Klikoni në fushë → kulm · klikoni dy kulme → hark nga i pari te i dyti.',
    sccGraph: 'Digraf për komponentet e lidhura fort',
    reachForward: 'reach⁺ (arrihet nga v)',
    reachBackward: 'reach⁻ (arrin v)',
    both: 'Të dyja → e njëjta SCC',
    auto: 'Hapi automatik',
    undo: 'Zhbëj',
    newOrder: 'Renditje e re',
    hideOrders: 'Fshih renditjet',
    showOrders: 'Shfaq të gjitha renditjet',
    dag: (name: string) => `DAG: ${name}`,
    availableNow: 'I disponueshëm tani',
    placedLegend: 'I vendosur (me numrin e radhës)',
    labAlgorithm: 'Algoritmi i laboratorit',
    pseudo: ['për çdo kulm v të pacaktuar:', '  F = bfs_reach(v)', '  B = bfs_reach(v, mbrapa)', '  SCC(v) = F ∩ B'],
    components: (n: number) => `Komponentet (${n})`,
    none: 'Ende asnjë.',
    reachTable: 'Tabela e arritshmërisë',
    acyclic: 'Pa cikle: çdo kulm është komponente më vete.',
    yourOrder: 'Renditja juaj',
    result: 'Rezultati',
    possible: (n: number) => `${n} renditje të mundshme`,
    found: (n: number) => `gjetur: ${n}`,
    mistakes: (n: number) => `gabime: ${n}`,
    orders: (shown: number, total: number) => `Renditjet (${shown} nga ${total})`,
  },
  {
    sccPresets: {
      lab: 'Three components',
      kater: 'Four components (slide 73)',
      cikel: 'One cycle — strongly connected',
      bosh: 'Empty digraph',
    },
    topoPresets: {
      lendet: { name: 'University courses', desc: 'Which course requires which?' },
      shtepia: { name: 'Build a house', desc: 'Which step comes before which?' },
      pasta: { name: 'Cook pasta', desc: 'Which step comes before which?' },
    },
    steps: {
      Themeli: 'Foundation',
      Muret: 'Walls',
      Çatia: 'Roof',
      Elektrike: 'Electrics',
      Hidraulike: 'Plumbing',
      Suvatim: 'Plastering',
      Lyerja: 'Painting',
      'Bli pastë': 'Buy pasta',
      'Ziej ujin': 'Boil water',
      'Shto pastën': 'Add the pasta',
      'Bëj salcën': 'Make the sauce',
      Kulloje: 'Drain it',
      'Shto salcën': 'Add the sauce',
      Shpërndaj: 'Serve',
    },
    already: (id) => `**${id}** is already placed.`,
    notYet: (id, missing) => `**${id}** cannot be placed yet: it needs ${missing} first.`,
    sccTitle: 'Strongly connected components (SCC)',
    topoTitle: 'Topological orders',
    sccSubtitle:
      'Two vertices are in the same component when each reaches the other. Build your own digraph or pick an example.',
    topoSubtitle: 'Place the vertices in order: only a vertex whose predecessors are all placed is allowed.',
    mode: 'Mode',
    topoMode: 'Topological order',
    digraph: 'Digraph',
    scenario: 'Scenario',
    valid: (order, mistakes, count) =>
      `**A valid order!** ${order}. Mistakes: ${mistakes}. There are **${count}** topological orders in all — try to find another.`,
    start: (desc) => `${desc} The vertices with a moving ring have no unplaced predecessors — choose one of them.`,
    available: (list, placed, total) => `Available now: **${list}**. Placed: ${placed}/${total}.`,
    clear: 'Clear',
    editHelp: 'Click the canvas → vertex · click two vertices → an edge from the first to the second.',
    sccGraph: 'Digraph for the strongly connected components',
    reachForward: 'reach⁺ (reachable from v)',
    reachBackward: 'reach⁻ (reaches v)',
    both: 'Both → the same SCC',
    auto: 'Automatic step',
    undo: 'Undo',
    newOrder: 'New order',
    hideOrders: 'Hide the orders',
    showOrders: 'Show all the orders',
    dag: (name) => `DAG: ${name}`,
    availableNow: 'Available now',
    placedLegend: 'Placed (with its number in the order)',
    labAlgorithm: 'The lab’s algorithm',
    pseudo: [
      'for every unassigned vertex v:',
      '  F = bfs_reach(v)',
      '  B = bfs_reach(v, backwards)',
      '  SCC(v) = F ∩ B',
    ],
    components: (n) => `Components (${n})`,
    none: 'None yet.',
    reachTable: 'Reachability table',
    acyclic: 'No cycles: every vertex is a component of its own.',
    yourOrder: 'Your order',
    result: 'Result',
    possible: (n) => `${n} possible orders`,
    found: (n) => `found: ${n}`,
    mistakes: (n) => `mistakes: ${n}`,
    orders: (shown, total) => `Orders (${shown} of ${total})`,
  },
);

export default function SccTopoViz({ mode: initialMode = 'scc', preset }: { mode?: 'scc' | 'topo'; preset?: string }) {
  const [mode, setMode] = useState<'scc' | 'topo'>(initialMode);
  const X = useText(TEXT);
  const S = useText(SCC_TEXT);
  const P = useText(PREDICT_TEXT);
  /** A vertex's name in the interface language. */
  const name = (id: string) => X.steps[id] ?? id;

  /* ---------------- SCC state ---------------- */
  const s0 = SCC_PRESETS.find((p) => p.id === preset) ?? SCC_PRESETS[0];
  const [sccPreset, setSccPreset] = useState(s0.id);
  const [nodes, setNodes] = useState<GNode[]>(s0.nodes);
  const [edges, setEdges] = useState<GEdge[]>(s0.edges);
  const [pending, setPending] = useState<string | null>(null);
  const idsKey = nodes.map((n) => n.id).join(',');
  const edgesKey = edges.map((e) => `${e.u}>${e.v}`).join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the graph's structure, so dragging a vertex does not restart the animation
  const steps = useMemo<SccStep[]>(() => sccSteps(nodes, edges, S), [idsKey, edgesKey, S]);
  const player = usePlayer(steps, 1100);
  const st = player.step;
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the graph's structure, so dragging a vertex does not restart the animation
  const reachTable = useMemo(
    () =>
      nodes
        .map((n) => n.id)
        .sort(natural)
        .map((id) => ({ id, fwd: reach(nodes, edges, id) })),
    [idsKey, edgesKey],
  );

  /* ---------------- topo state ---------------- */
  const t0 = TOPO_PRESETS.find((p) => p.id === preset) ?? TOPO_PRESETS[0];
  const [topoPreset, setTopoPreset] = useState(t0.id);
  const topo = must(
    TOPO_PRESETS.find((p) => p.id === topoPreset),
    'preset',
  );
  const [tNodes, setTNodes] = useState<GNode[]>(t0.nodes);
  const [placed, setPlaced] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [found, setFound] = useState<string[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // Predict mode (#149): the vertices that may come next (Kahn's queue) are no longer shown; each
  // pick is a prediction, right when all its prerequisites are placed.
  const [predicting, setPredicting] = useState(false);
  const [good, setGood] = useState<string | null>(null);
  const avail = available(tNodes, topo.edges, placed);
  const orders = useMemo(() => allOrders(topo.nodes, topo.edges, 24), [topo]);
  const complete = placed.length === tNodes.length && tNodes.length > 0;

  const loadTopo = (id: string) => {
    const p = must(
      TOPO_PRESETS.find((x) => x.id === id),
      'preset',
    );
    setTopoPreset(id);
    setTNodes(p.nodes);
    setPlaced([]);
    setMistakes(0);
    setFound([]);
    setFlash(null);
    setGood(null);
  };
  const predictTopo = (on: boolean) => {
    setPredicting(on);
    setPlaced([]);
    setMistakes(0);
    setFlash(null);
    setGood(null);
  };
  const place = (id: string) => {
    if (complete) return;
    setGood(null);
    if (placed.includes(id)) return setFlash(X.already(name(id)));
    if (!avail.includes(id)) {
      const missing = topo.edges.filter((e) => e.v === id && !placed.includes(e.u)).map((e) => e.u);
      setMistakes((m) => m + 1);
      return setFlash(X.notYet(name(id), missing.map(name).join(', ')));
    }
    const next = [...placed, id];
    setPlaced(next);
    setFlash(null);
    if (predicting) setGood(P.topo.right(name(id)));
    if (next.length === tNodes.length) {
      const key = next.join(' → ');
      setFound((f) => (f.includes(key) ? f : [...f, key]));
    }
  };

  /* ---------------- SCC editing ---------------- */
  const loadScc = (id: string) => {
    const p = must(
      SCC_PRESETS.find((x) => x.id === id),
      'preset',
    );
    setSccPreset(id);
    setNodes(p.nodes);
    setEdges(p.edges);
    setPending(null);
  };
  const addNode = (x: number, y: number) => {
    if (nodes.length >= 14) return;
    const used = new Set(nodes.map((n) => n.id));
    let id = '';
    for (let i = 0; i < 26 && !id; i++) if (!used.has(String.fromCharCode(97 + i))) id = String.fromCharCode(97 + i);
    setNodes([...nodes, { id, x, y }]);
  };
  const clickScc = (id: string) => {
    if (!pending) return setPending(id);
    if (pending !== id && !edges.some((e) => e.u === pending && e.v === id))
      setEdges([...edges, { u: pending, v: id }]);
    setPending(null);
  };

  const compOf = (id: string) => st.comps.findIndex((c) => c.includes(id));

  const sccLook = (n: GNode): NodeLook => {
    const ci = compOf(n.id);
    if (pending === n.id) return { ring: 'var(--viz-active)', stroke: 'var(--viz-active)' };
    const inF = st.forward.includes(n.id),
      inB = st.backward.includes(n.id);
    if (st.pivot && (inF || inB) && ci === -1)
      return {
        fill: inF && inB ? soft('var(--viz-active)', 32) : inF ? soft('var(--viz-path)') : soft('var(--viz-compare)'),
        stroke: inF && inB ? 'var(--viz-active)' : inF ? 'var(--viz-path)' : 'var(--viz-compare)',
        ring: n.id === st.pivot ? 'var(--viz-active)' : undefined,
        sub: inF && inB ? '⁺ ∩ ⁻' : inF ? 'reach⁺' : 'reach⁻',
      };
    if (ci >= 0) {
      const c = COMP_COLORS[ci % COMP_COLORS.length];
      return {
        fill: soft(c, 30),
        stroke: c,
        strokeWidth: 3,
        badge: String(ci + 1),
        badgeColor: c,
        ring: n.id === st.pivot ? c : undefined,
      };
    }
    return {};
  };
  const sccEdge = (e: GEdge) => {
    const a = compOf(e.u),
      b = compOf(e.v);
    if (a >= 0 && a === b) return { stroke: COMP_COLORS[a % COMP_COLORS.length], width: 3 };
    if (st.pivot && st.forward.includes(e.u) && st.forward.includes(e.v))
      return { stroke: 'var(--viz-path)', width: 2.5 };
    return { dim: a >= 0 && b >= 0 && a !== b ? false : undefined };
  };

  const topoLook = (n: GNode): NodeLook => {
    const pos = placed.indexOf(n.id);
    if (pos >= 0)
      return {
        fill: soft('var(--viz-done)', 30),
        stroke: 'var(--viz-done)',
        badge: String(pos + 1),
        badgeColor: 'var(--viz-done)',
      };
    if (!predicting && avail.includes(n.id))
      return { stroke: 'var(--viz-active)', strokeWidth: 3, ring: 'var(--viz-active)' };
    return { dim: false, stroke: 'var(--viz-line)' };
  };
  const topoEdge = (e: GEdge) => (placed.includes(e.u) ? { stroke: 'var(--viz-done)', width: 2.5 } : {});

  const cyclic = mode === 'topo' ? false : hasCycle(nodes, edges);

  return (
    <VizShell
      title={mode === 'scc' ? X.sccTitle : X.topoTitle}
      subtitle={mode === 'scc' ? X.sccSubtitle : X.topoSubtitle}
      icon={<GitBranch />}
      onKeyDown={mode === 'scc' ? playerKeys(player) : undefined}
      toolbar={
        <>
          <Field label={X.mode}>
            <Segmented
              label={X.mode}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'scc', label: 'SCC — reach⁺ ∩ reach⁻', icon: <GitBranch className="size-4" /> },
                { value: 'topo', label: X.topoMode, icon: <ListOrdered className="size-4" /> },
              ]}
            />
          </Field>
          {mode === 'scc' ? (
            <Field label={X.digraph}>
              <Choice
                label={X.digraph}
                value={sccPreset}
                onChange={loadScc}
                options={SCC_PRESETS.map((p) => ({ value: p.id, label: X.sccPresets[p.id] ?? p.id }))}
                className="w-60"
              />
            </Field>
          ) : (
            <Field label={X.scenario}>
              <Choice
                label={X.scenario}
                value={topoPreset}
                onChange={loadTopo}
                options={TOPO_PRESETS.map((p) => ({ value: p.id, label: X.topoPresets[p.id]?.name ?? p.id }))}
                className="w-52"
              />
            </Field>
          )}
        </>
      }
      footer={
        mode === 'scc' ? (
          <>
            <StepNote text={st.note} tone={player.atEnd ? 'success' : 'accent'} />
            <PlayerBar player={player} />
          </>
        ) : (
          <>
            <StepNote
              tone={flash ? 'danger' : complete || good ? 'success' : 'accent'}
              text={
                flash ??
                (complete
                  ? X.valid(placed.map(name).join(' → '), mistakes, orders.count)
                  : (good ??
                    (placed.length === 0
                      ? X.start(X.topoPresets[topo.id]?.desc ?? '')
                      : predicting
                        ? P.topo.help
                        : X.available(avail.map(name).join(', '), placed.length, tNodes.length))))
              }
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1" data-testid="predict">
              <Toggle label={P.mode} value={predicting} onChange={predictTopo} />
              <span className="text-xs text-muted">
                {predicting && placed.length + mistakes > 0
                  ? P.score(placed.length, placed.length + mistakes)
                  : predicting
                    ? P.topo.help
                    : P.help}
              </span>
            </div>
          </>
        )
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          {mode === 'scc' ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    setNodes([]);
                    setEdges([]);
                    setPending(null);
                  }}
                >
                  <Trash2 /> {X.clear}
                </Button>
                <span className="text-xs text-muted">{X.editHelp}</span>
              </div>
              <div className="rounded-2xl border border-border bg-[var(--viz-canvas)] bg-grid">
                <GraphCanvas
                  nodes={nodes}
                  edges={edges}
                  directed
                  width={W}
                  height={H}
                  nodeLook={sccLook}
                  edgeLook={sccEdge}
                  onBackgroundClick={addNode}
                  onNodeClick={clickScc}
                  onNodeMove={(id, x, y) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x, y } : n)))}
                  ariaLabel={X.sccGraph}
                />
              </div>
              <Legend
                items={[
                  { color: 'var(--viz-path)', label: X.reachForward },
                  { color: 'var(--viz-compare)', label: X.reachBackward },
                  { color: 'var(--viz-active)', label: X.both },
                ]}
              />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={complete || !avail.length || predicting}
                  onPress={() => place(avail[0])}
                >
                  <Wand2 /> {X.auto}
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  isDisabled={!placed.length}
                  onPress={() => {
                    setPlaced(placed.slice(0, -1));
                    setFlash(null);
                  }}
                >
                  <Undo2 /> {X.undo}
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  onPress={() => {
                    setPlaced([]);
                    setFlash(null);
                  }}
                >
                  <Shuffle /> {X.newOrder}
                </Button>
                <Button size="sm" variant="ghost" onPress={() => setShowAll(!showAll)}>
                  {showAll ? <EyeOff /> : <Eye />} {showAll ? X.hideOrders : X.showOrders}
                </Button>
              </div>
              <div className="rounded-2xl border border-border bg-[var(--viz-canvas)] bg-grid">
                <GraphCanvas
                  nodes={tNodes.map((n) => ({ ...n, label: name(n.id) }))}
                  edges={topo.edges}
                  directed
                  width={W}
                  height={H}
                  shape="pill"
                  nodeLook={topoLook}
                  edgeLook={topoEdge}
                  onNodeClick={place}
                  onNodeMove={(id, x, y) => setTNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x, y } : n)))}
                  ariaLabel={X.dag(X.topoPresets[topo.id]?.name ?? topo.id)}
                />
              </div>
              <Legend
                items={[
                  { color: 'var(--viz-active)', label: X.availableNow, shape: 'ring' },
                  { color: 'var(--viz-done)', label: X.placedLegend },
                ]}
              />
            </>
          )}
        </div>

        <div className="grid min-w-0 content-start gap-3">
          {mode === 'scc' ? (
            <>
              <Panel title={X.labAlgorithm}>
                <Pseudocode lines={X.pseudo} active={st.line} />
              </Panel>
              <Panel title={X.components(st.comps.length)}>
                {st.comps.length === 0 ? (
                  <p className="text-sm text-muted">{X.none}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {st.comps.map((c, i) => (
                      <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: components are numbered in the order they are found
                        key={i}
                        className="flex items-center gap-2 font-mono text-sm"
                      >
                        <span
                          className="grid size-5 place-items-center rounded-full text-[0.65rem] font-bold text-white"
                          style={{ background: COMP_COLORS[i % COMP_COLORS.length] }}
                        >
                          {i + 1}
                        </span>
                        {`{${c.join(', ')}}`}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title={X.reachTable}>
                <ul className="space-y-1 font-mono text-[0.78rem]">
                  {reachTable.map((r) => (
                    <li key={r.id} className="flex gap-2">
                      <span className="w-6 shrink-0 font-semibold">{r.id}</span>
                      <span className="text-muted">→</span>
                      <span className="break-words">{`{${r.fwd.join(', ')}}`}</span>
                    </li>
                  ))}
                </ul>
                {!cyclic && nodes.length > 0 && <p className="mt-2 text-xs text-muted">{X.acyclic}</p>}
              </Panel>
            </>
          ) : (
            <>
              <Panel title={X.yourOrder}>
                <TokenRow items={placed.map(name)} tone="success" empty="—" />
              </Panel>
              <Panel title={X.result}>
                <div className="flex flex-wrap gap-1.5">
                  <Chip size="sm" variant="soft" color="accent">
                    {X.possible(orders.count)}
                  </Chip>
                  <Chip size="sm" variant="soft" color={found.length ? 'success' : 'default'}>
                    {X.found(found.length)}
                  </Chip>
                  <Chip size="sm" variant="soft" color={mistakes ? 'danger' : 'default'}>
                    {X.mistakes(mistakes)}
                  </Chip>
                </div>
              </Panel>
              {showAll && (
                <Panel title={X.orders(Math.min(orders.list.length, orders.count), orders.count)}>
                  <ol className="max-h-64 space-y-1 overflow-y-auto font-mono text-[0.72rem] text-muted">
                    {orders.list.map((o, i) => (
                      <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: the list of orders is fixed for the graph; i is its number
                        key={i}
                        className={found.includes(o.join(' → ')) ? 'font-semibold text-success' : ''}
                      >
                        {i + 1}. {o.map(name).join(' → ')}
                      </li>
                    ))}
                  </ol>
                </Panel>
              )}
            </>
          )}
        </div>
      </div>
    </VizShell>
  );
}

import { Button, Chip } from '@heroui/react';
import { Eye, EyeOff, GitBranch, ListOrdered, Shuffle, Trash2, Undo2, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { natural } from './algorithms/graphs';
import { allOrders, available, hasCycle, layeredLayout, reach, type SccStep, sccSteps } from './algorithms/scc';
import { Choice, Field, PlayerBar, Segmented } from './kit/controls';
import { fitLayout, type GEdge, type GNode, GraphCanvas, type NodeLook } from './kit/GraphCanvas';
import { must } from './kit/must';
import { Legend, Panel, Pseudocode, StepNote, TokenRow, VizShell } from './kit/shell';
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
    name: 'Tre komponente',
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
    name: 'Katër komponente (slide 73)',
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
    name: 'Një cikël — i lidhur fort',
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
  { id: 'bosh', name: 'Digraf bosh', nodes: [] as GNode[], edges: [] as GEdge[] },
];

const dag = (ids: string[], edges: string[][]) => {
  const e = arcs(edges);
  return { nodes: layeredLayout(ids, e, W, H) as GNode[], edges: e };
};

const TOPO_PRESETS = [
  {
    id: 'lendet',
    name: 'Lëndët universitare',
    desc: 'Cila lëndë kërkon cilën?',
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
    name: 'Ndërto shtëpinë',
    desc: 'Cilin hap para cilit?',
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
    name: 'Gatuaj pastë',
    desc: 'Cili hap vjen para cilit?',
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

export default function SccTopoViz({ mode: initialMode = 'scc', preset }: { mode?: 'scc' | 'topo'; preset?: string }) {
  const [mode, setMode] = useState<'scc' | 'topo'>(initialMode);

  /* ---------------- SCC state ---------------- */
  const s0 = SCC_PRESETS.find((p) => p.id === preset) ?? SCC_PRESETS[0];
  const [sccPreset, setSccPreset] = useState(s0.id);
  const [nodes, setNodes] = useState<GNode[]>(s0.nodes);
  const [edges, setEdges] = useState<GEdge[]>(s0.edges);
  const [pending, setPending] = useState<string | null>(null);
  const idsKey = nodes.map((n) => n.id).join(',');
  const edgesKey = edges.map((e) => `${e.u}>${e.v}`).join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the graph's structure, so dragging a vertex does not restart the animation
  const steps = useMemo<SccStep[]>(() => sccSteps(nodes, edges), [idsKey, edgesKey]);
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
  };
  const place = (id: string) => {
    if (complete) return;
    if (placed.includes(id)) return setFlash(`**${id}** është vendosur tashmë.`);
    if (!avail.includes(id)) {
      const missing = topo.edges.filter((e) => e.v === id && !placed.includes(e.u)).map((e) => e.u);
      setMistakes((m) => m + 1);
      return setFlash(`**${id}** nuk mund të vendoset ende: kërkon më parë ${missing.join(', ')}.`);
    }
    const next = [...placed, id];
    setPlaced(next);
    setFlash(null);
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
    if (avail.includes(n.id)) return { stroke: 'var(--viz-active)', strokeWidth: 3, ring: 'var(--viz-active)' };
    return { dim: false, stroke: 'var(--viz-line)' };
  };
  const topoEdge = (e: GEdge) => (placed.includes(e.u) ? { stroke: 'var(--viz-done)', width: 2.5 } : {});

  const cyclic = mode === 'topo' ? false : hasCycle(nodes, edges);

  return (
    <VizShell
      title={mode === 'scc' ? 'Komponentet e lidhura fort (SCC)' : 'Renditjet topologjike'}
      subtitle={
        mode === 'scc'
          ? 'Dy kulme janë në të njëjtën komponente kur secili arrin tjetrin. Ndërtoni digrafin tuaj ose zgjidhni një shembull.'
          : 'Vendosni kulmet me radhë: lejohet vetëm një kulm që i ka të gjithë paraardhësit të vendosur.'
      }
      icon={<GitBranch />}
      onKeyDown={mode === 'scc' ? playerKeys(player) : undefined}
      toolbar={
        <>
          <Field label="Mënyra">
            <Segmented
              label="Mënyra"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'scc', label: 'SCC — reach⁺ ∩ reach⁻', icon: <GitBranch className="size-4" /> },
                { value: 'topo', label: 'Renditja topologjike', icon: <ListOrdered className="size-4" /> },
              ]}
            />
          </Field>
          {mode === 'scc' ? (
            <Field label="Digrafi">
              <Choice
                label="Digrafi"
                value={sccPreset}
                onChange={loadScc}
                options={SCC_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
                className="w-60"
              />
            </Field>
          ) : (
            <Field label="Skenari">
              <Choice
                label="Skenari"
                value={topoPreset}
                onChange={loadTopo}
                options={TOPO_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
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
          <StepNote
            tone={flash ? 'danger' : complete ? 'success' : 'accent'}
            text={
              flash ??
              (complete
                ? `**Renditje e vlefshme!** ${placed.join(' → ')}. Gabime: ${mistakes}. Gjithsej ekzistojnë **${orders.count}** renditje topologjike — provoni të gjeni një tjetër.`
                : placed.length === 0
                  ? `${topo.desc} Kulmet me rreth lëvizës nuk kanë paraardhës të pavendosur — zgjidhni njërin.`
                  : `Të disponueshme tani: **${avail.join(', ')}**. Vendosur: ${placed.length}/${tNodes.length}.`)
            }
          />
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
                  <Trash2 /> Pastro
                </Button>
                <span className="text-xs text-muted">
                  Klikoni në fushë → kulm · klikoni dy kulme → hark nga i pari te i dyti.
                </span>
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
                  ariaLabel="Digraf për komponentet e lidhura fort"
                />
              </div>
              <Legend
                items={[
                  { color: 'var(--viz-path)', label: 'reach⁺ (arrihet nga v)' },
                  { color: 'var(--viz-compare)', label: 'reach⁻ (arrin v)' },
                  { color: 'var(--viz-active)', label: 'Të dyja → e njëjta SCC' },
                ]}
              />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={complete || !avail.length}
                  onPress={() => place(avail[0])}
                >
                  <Wand2 /> Hapi automatik
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
                  <Undo2 /> Zhbëj
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  onPress={() => {
                    setPlaced([]);
                    setFlash(null);
                  }}
                >
                  <Shuffle /> Renditje e re
                </Button>
                <Button size="sm" variant="ghost" onPress={() => setShowAll(!showAll)}>
                  {showAll ? <EyeOff /> : <Eye />} {showAll ? 'Fshih renditjet' : 'Shfaq të gjitha renditjet'}
                </Button>
              </div>
              <div className="rounded-2xl border border-border bg-[var(--viz-canvas)] bg-grid">
                <GraphCanvas
                  nodes={tNodes}
                  edges={topo.edges}
                  directed
                  width={W}
                  height={H}
                  shape="pill"
                  nodeLook={topoLook}
                  edgeLook={topoEdge}
                  onNodeClick={place}
                  onNodeMove={(id, x, y) => setTNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x, y } : n)))}
                  ariaLabel={`DAG: ${topo.name}`}
                />
              </div>
              <Legend
                items={[
                  { color: 'var(--viz-active)', label: 'I disponueshëm tani', shape: 'ring' },
                  { color: 'var(--viz-done)', label: 'I vendosur (me numrin e radhës)' },
                ]}
              />
            </>
          )}
        </div>

        <div className="grid min-w-0 content-start gap-3">
          {mode === 'scc' ? (
            <>
              <Panel title="Algoritmi i laboratorit">
                <Pseudocode
                  lines={[
                    'për çdo kulm v të pacaktuar:',
                    '  F = bfs_reach(v)',
                    '  B = bfs_reach(v, mbrapa)',
                    '  SCC(v) = F ∩ B',
                  ]}
                  active={st.line}
                />
              </Panel>
              <Panel title={`Komponentet (${st.comps.length})`}>
                {st.comps.length === 0 ? (
                  <p className="text-sm text-muted">Ende asnjë.</p>
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
              <Panel title="Tabela e arritshmërisë">
                <ul className="space-y-1 font-mono text-[0.78rem]">
                  {reachTable.map((r) => (
                    <li key={r.id} className="flex gap-2">
                      <span className="w-6 shrink-0 font-semibold">{r.id}</span>
                      <span className="text-muted">→</span>
                      <span className="break-words">{`{${r.fwd.join(', ')}}`}</span>
                    </li>
                  ))}
                </ul>
                {!cyclic && nodes.length > 0 && (
                  <p className="mt-2 text-xs text-muted">Pa cikle: çdo kulm është komponente më vete.</p>
                )}
              </Panel>
            </>
          ) : (
            <>
              <Panel title="Renditja juaj">
                <TokenRow items={placed} tone="success" empty="—" />
              </Panel>
              <Panel title="Rezultati">
                <div className="flex flex-wrap gap-1.5">
                  <Chip size="sm" variant="soft" color="accent">
                    {orders.count} renditje të mundshme
                  </Chip>
                  <Chip size="sm" variant="soft" color={found.length ? 'success' : 'default'}>
                    gjetur: {found.length}
                  </Chip>
                  <Chip size="sm" variant="soft" color={mistakes ? 'danger' : 'default'}>
                    gabime: {mistakes}
                  </Chip>
                </div>
              </Panel>
              {showAll && (
                <Panel title={`Renditjet (${Math.min(orders.list.length, orders.count)} nga ${orders.count})`}>
                  <ol className="max-h-64 space-y-1 overflow-y-auto font-mono text-[0.72rem] text-muted">
                    {orders.list.map((o, i) => (
                      <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: the list of orders is fixed for the graph; i is its number
                        key={i}
                        className={found.includes(o.join(' → ')) ? 'font-semibold text-success' : ''}
                      >
                        {i + 1}. {o.join(' → ')}
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

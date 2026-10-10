import { Button, Chip, Input } from '@heroui/react';
import { Eraser, MapPinned, Trash2, Waypoints } from 'lucide-react';
import { useMemo, useState } from 'react';
import { natural } from './algorithms/graphs';
import { bellmanFordSteps, dijkstraSteps, inf, type PathStep, pathTo, toArcs } from './algorithms/shortest';
import { Choice, Field, PlayerBar, Segmented, Toggle } from './kit/controls';
import { type EdgeLook, fitLayout, type GEdge, type GNode, GraphCanvas, type NodeLook } from './kit/GraphCanvas';
import { must } from './kit/must';
import { StepNote, VizShell } from './kit/shell';
import { playerKeys, usePlayer } from './kit/usePlayer';

/* =====================================================================
 *  Dijkstra kundrejt Bellman-Ford — Laboratori 7 (+ fletoret hap pas hapi)
 *  Every preset is the exact graph of an exercise in the lab.
 * ===================================================================== */

interface PathPreset {
  id: string;
  name: string;
  note: string;
  directed: boolean;
  nodes: GNode[];
  edges: GEdge[];
  source: string;
  target: string;
  w: number;
  h: number;
  pill?: boolean;
  negCycle?: GEdge;
}

const P = (list: [string, number, number][], w: number, h: number, pad = 56, flip = false) =>
  fitLayout(
    list.map(([id, x, y]) => ({ id, x, y })),
    w,
    h,
    pad,
    flip,
  );
const E = (list: (string | number)[][]): GEdge[] =>
  list.map(([u, v, w]) => ({ u: String(u), v: String(v), w: Number(w) }));

export const PATH_PRESETS: PathPreset[] = [
  {
    id: 'shqiperia',
    name: 'Harta e Shqipërisë (Ush. 1)',
    note: 'GPS mbi 12 qytete: rrugët janë të dyanshme, peshat janë kilometra.',
    directed: false,
    pill: true,
    w: 560,
    h: 620,
    source: 'Tiranë',
    target: 'Gjirokastër',
    nodes: P(
      [
        ['Shkodër', 210, 80],
        ['Lezhë', 240, 160],
        ['Tiranë', 270, 270],
        ['Durrës', 180, 290],
        ['Elbasan', 370, 320],
        ['Berat', 320, 430],
        ['Lushnjë', 250, 400],
        ['Fier', 230, 490],
        ['Vlorë', 180, 580],
        ['Gjirokastër', 340, 600],
        ['Korçë', 490, 450],
        ['Pogradec', 450, 360],
      ],
      560,
      620,
      50,
    ),
    edges: E([
      ['Shkodër', 'Lezhë', 45],
      ['Lezhë', 'Tiranë', 90],
      ['Lezhë', 'Durrës', 70],
      ['Tiranë', 'Durrës', 38],
      ['Tiranë', 'Elbasan', 54],
      ['Durrës', 'Lushnjë', 70],
      ['Elbasan', 'Pogradec', 70],
      ['Elbasan', 'Berat', 80],
      ['Lushnjë', 'Berat', 45],
      ['Lushnjë', 'Fier', 30],
      ['Fier', 'Vlorë', 50],
      ['Fier', 'Berat', 40],
      ['Berat', 'Gjirokastër', 110],
      ['Vlorë', 'Gjirokastër', 100],
      ['Gjirokastër', 'Korçë', 130],
      ['Korçë', 'Pogradec', 50],
    ]),
  },
  {
    id: 'klasa1',
    name: 'Punë në Klasë 1 — Dijkstra me dorë',
    note: 'Kontrolloni tabelën tuaj: çdo hap i Dijkstra-s nga A.',
    directed: true,
    w: 640,
    h: 380,
    source: 'A',
    target: 'F',
    nodes: P(
      [
        ['A', 70, 180],
        ['B', 220, 70],
        ['C', 220, 290],
        ['D', 380, 70],
        ['E', 380, 290],
        ['F', 530, 180],
      ],
      640,
      380,
    ),
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
  },
  {
    id: 'dorezimi',
    name: 'Rrjeti i dorëzimit (Ush. 3)',
    note: 'Dy subvencione (peshë negative). Aktivizoni ciklin negativ për të parë si e zbulon Bellman-Ford.',
    directed: true,
    pill: true,
    w: 720,
    h: 420,
    source: 'Depot',
    target: 'Hub',
    nodes: P(
      [
        ['Depot', 130, 340],
        ['Alfa', 290, 160],
        ['Beta', 290, 340],
        ['Gama', 290, 520],
        ['Delta', 490, 240],
        ['Eta', 490, 440],
        ['Zeta', 680, 340],
        ['Hub', 820, 340],
      ],
      720,
      420,
      46,
    ),
    edges: E([
      ['Depot', 'Alfa', 6],
      ['Depot', 'Beta', 7],
      ['Depot', 'Gama', 9],
      ['Alfa', 'Delta', 5],
      ['Beta', 'Delta', 8],
      ['Beta', 'Eta', -3],
      ['Gama', 'Eta', 7],
      ['Delta', 'Zeta', -4],
      ['Eta', 'Zeta', 6],
      ['Zeta', 'Hub', 3],
      ['Delta', 'Eta', 4],
    ]),
    negCycle: { u: 'Zeta', v: 'Beta', w: -5 },
  },
  {
    id: 'klasa2',
    name: 'Punë në Klasë 2 — cikël negativ',
    note: 'A→B→C→D→A ka peshë 1 − 4 − 1 + 3 = −1: cikël negativ.',
    directed: true,
    w: 640,
    h: 360,
    source: 'A',
    target: 'D',
    nodes: P(
      [
        ['A', 80, 80],
        ['B', 300, 80],
        ['C', 520, 80],
        ['D', 300, 280],
      ],
      640,
      360,
    ),
    edges: E([
      ['A', 'B', 1],
      ['B', 'C', -4],
      ['C', 'D', 2],
      ['D', 'A', 3],
      ['C', 'D', -1],
    ]),
  },
  {
    id: 'kuizi',
    name: 'Grafi i kuizit (Ush. 4)',
    note: '6 kulme me peshë pozitive dhe negative.',
    directed: true,
    w: 640,
    h: 380,
    source: 'A',
    target: 'F',
    nodes: P(
      [
        ['A', 160, 340],
        ['B', 320, 180],
        ['C', 320, 500],
        ['D', 520, 180],
        ['E', 520, 500],
        ['F', 700, 340],
      ],
      640,
      380,
    ),
    edges: E([
      ['A', 'B', 4],
      ['A', 'C', 2],
      ['B', 'D', 5],
      ['B', 'C', -1],
      ['C', 'E', 3],
      ['D', 'F', 2],
      ['D', 'E', 1],
      ['E', 'F', 4],
      ['B', 'E', -3],
    ]),
  },
  {
    id: 'nb-dijkstra',
    name: 'Fletorja Dijkstra — hap pas hapi',
    note: 'Grafi i fletores plotësuese të Dijkstra-s.',
    directed: false,
    w: 640,
    h: 340,
    source: 'A',
    target: 'F',
    nodes: P(
      [
        ['A', 0, 1],
        ['B', 1.5, 2],
        ['C', 1.5, 0],
        ['D', 3, 2],
        ['E', 3, 0],
        ['F', 4.5, 1],
      ],
      640,
      340,
      56,
      true,
    ),
    edges: E([
      ['A', 'B', 4],
      ['A', 'C', 2],
      ['B', 'C', 1],
      ['B', 'D', 5],
      ['B', 'E', 1],
      ['C', 'E', 5],
      ['D', 'E', 1],
      ['D', 'F', 3],
      ['E', 'F', 4],
    ]),
  },
  {
    id: 'nb-bf',
    name: 'Fletorja Bellman-Ford — hap pas hapi',
    note: 'Grafi i fletores plotësuese të Bellman-Ford-it.',
    directed: true,
    w: 640,
    h: 340,
    source: '1',
    target: '7',
    nodes: P(
      [
        ['1', 0, 1],
        ['2', 1.5, 2],
        ['3', 1.5, 1],
        ['4', 1.5, 0],
        ['5', 3, 2],
        ['6', 3, 0],
        ['7', 4.5, 1],
      ],
      640,
      340,
      56,
      true,
    ),
    edges: E([
      ['1', '2', 6],
      ['1', '3', 5],
      ['1', '4', 5],
      ['2', '5', -1],
      ['3', '2', -2],
      ['3', '5', 1],
      ['4', '3', -2],
      ['4', '6', -1],
      ['5', '7', 3],
      ['6', '7', 3],
    ]),
  },
  {
    id: 'ndertoni',
    name: 'Ndërtoni grafin tuaj (Ush. 2)',
    note: 'Klikoni në fushë për kulme dhe në dy kulme për një brinjë me peshën e zgjedhur.',
    directed: true,
    w: 680,
    h: 400,
    source: 'A',
    target: 'C',
    nodes: P(
      [
        ['A', 100, 200],
        ['B', 300, 80],
        ['C', 520, 200],
      ],
      680,
      400,
      80,
    ),
    edges: E([
      ['A', 'B', 3],
      ['B', 'C', 4],
      ['A', 'C', 9],
    ]),
  },
];

const soft = (c: string, p = 24) => `color-mix(in oklab, ${c} ${p}%, var(--surface))`;

export default function PathsViz({
  preset: initialPreset = 'klasa1',
  view: initialView = 'both',
}: {
  preset?: string;
  view?: 'both' | 'dijkstra' | 'bellman';
}) {
  const p0 = PATH_PRESETS.find((p) => p.id === initialPreset) ?? PATH_PRESETS[0];
  const [presetId, setPresetId] = useState(p0.id);
  const preset = must(
    PATH_PRESETS.find((p) => p.id === presetId),
    'preset',
  );
  const [nodes, setNodes] = useState<GNode[]>(p0.nodes);
  const [edges, setEdges] = useState<GEdge[]>(p0.edges);
  const [directed, setDirected] = useState(p0.directed);
  const [source, setSource] = useState(p0.source);
  const [target, setTarget] = useState(p0.target);
  const [view, setView] = useState(initialView);
  const [negCycle, setNegCycle] = useState(false);
  const [edit, setEdit] = useState(p0.id === 'ndertoni');
  const [tool, setTool] = useState<'edit' | 'delete'>('edit');
  const [pending, setPending] = useState<string | null>(null);
  const [newW, setNewW] = useState('5');

  const load = (id: string) => {
    const p = must(
      PATH_PRESETS.find((x) => x.id === id),
      'preset',
    );
    setPresetId(id);
    setNodes(p.nodes);
    setEdges(p.edges);
    setDirected(p.directed);
    setSource(p.source);
    setTarget(p.target);
    setNegCycle(false);
    setEdit(id === 'ndertoni');
    setPending(null);
  };

  const allEdges = useMemo(
    () => (negCycle && preset.negCycle ? [...edges, preset.negCycle] : edges),
    [edges, negCycle, preset],
  );
  const ids = nodes.map((n) => n.id).sort(natural);
  const src = ids.includes(source) ? source : (ids[0] ?? '');
  const dst = ids.includes(target) ? target : (ids[ids.length - 1] ?? '');
  const key = `${nodes.map((n) => n.id).join(',')}|${allEdges.map((e) => `${e.u}>${e.v}:${e.w}`).join(',')}|${directed}|${src}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the graph's structure, so dragging a vertex does not restart the animation
  const runs = useMemo(() => {
    const arcs = toArcs(allEdges, directed);
    return src ? { d: dijkstraSteps(nodes, arcs, src), b: bellmanFordSteps(nodes, arcs, src) } : null;
  }, [key]);
  const ticks = useMemo(
    () => Array.from({ length: runs ? Math.max(runs.d.length, runs.b.length) : 1 }, (_, i) => i),
    [runs],
  );
  const player = usePlayer(ticks, 800);
  const t = player.index;

  /* ---- editing ---- */
  const addNode = (x: number, y: number) => {
    if (!edit || tool !== 'edit' || nodes.length >= 14) return;
    const used = new Set(nodes.map((n) => n.id));
    let id = '';
    for (let i = 0; i < 26 && !id; i++) if (!used.has(String.fromCharCode(65 + i))) id = String.fromCharCode(65 + i);
    setNodes([...nodes, { id, x, y }]);
  };
  const clickNode = (id: string) => {
    if (!edit) return;
    if (tool === 'delete') {
      setNodes(nodes.filter((n) => n.id !== id));
      setEdges(edges.filter((e) => e.u !== id && e.v !== id));
      return;
    }
    if (!pending) return setPending(id);
    if (pending !== id)
      setEdges([
        ...edges.filter((e) => !(e.u === pending && e.v === id)),
        { u: pending, v: id, w: Math.round(Number(newW) || 0) },
      ]);
    setPending(null);
  };
  const clickEdge = (i: number) => {
    if (edit && tool === 'delete' && i < edges.length) setEdges(edges.filter((_, k) => k !== i));
  };

  const panels = (['d', 'b'] as const).filter((k) => view === 'both' || (view === 'dijkstra' ? k === 'd' : k === 'b'));

  return (
    <VizShell
      title="Rrugët më të shkurtra — Dijkstra kundrejt Bellman-Ford"
      subtitle="I njëjti graf, dy algoritme krah për krah. Dijkstra zgjedh me lakmi; Bellman-Ford relakson çdo brinjë në çdo iterim."
      icon={<MapPinned />}
      onKeyDown={playerKeys(player)}
      toolbar={
        <>
          <Field label="Grafi">
            <Choice
              label="Grafi"
              value={presetId}
              onChange={load}
              options={PATH_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
              className="w-72"
            />
          </Field>
          <Field label="Shfaq">
            <Segmented
              label="Algoritmet"
              value={view}
              onChange={setView}
              options={[
                { value: 'both', label: 'Të dy' },
                { value: 'dijkstra', label: 'Dijkstra' },
                { value: 'bellman', label: 'Bellman-Ford' },
              ]}
            />
          </Field>
          <Field label="Nga → te">
            <div className="flex items-center gap-1.5">
              <Choice
                label="Burimi"
                value={src}
                onChange={setSource}
                options={ids.map((i) => ({ value: i, label: i }))}
                className="w-36"
              />
              <span className="text-muted">→</span>
              <Choice
                label="Destinacioni"
                value={dst}
                onChange={setTarget}
                options={ids.map((i) => ({ value: i, label: i }))}
                className="w-36"
              />
            </div>
          </Field>
          <div className="flex flex-wrap items-center gap-4 pb-1">
            {preset.negCycle && (
              <Toggle
                label={`Cikël negativ (${preset.negCycle.u}→${preset.negCycle.v} = ${preset.negCycle.w})`}
                value={negCycle}
                onChange={setNegCycle}
              />
            )}
            <Toggle
              label="Edito grafin"
              value={edit}
              onChange={(v) => {
                setEdit(v);
                setPending(null);
              }}
            />
          </div>
        </>
      }
      footer={<PlayerBar player={player} />}
    >
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {edit && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border p-2.5">
            <Segmented
              label="Mjeti"
              value={tool}
              onChange={(v) => {
                setTool(v);
                setPending(null);
              }}
              options={[
                { value: 'edit', label: 'Shto / lidh', icon: <Waypoints className="size-4" /> },
                { value: 'delete', label: 'Fshi', icon: <Eraser className="size-4" /> },
              ]}
            />
            <label className="flex items-center gap-2 text-sm text-muted">
              pesha
              <Input
                aria-label="Pesha e brinjës së re"
                type="number"
                value={newW}
                onChange={(e) => setNewW(e.target.value)}
                className="w-20 font-mono"
              />
            </label>
            <Toggle label="I drejtuar" value={directed} onChange={setDirected} />
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
              {pending
                ? `Zgjodhët ${pending} — klikoni kulmin tjetër.`
                : 'Klikoni në fushë → kulm · dy kulme → brinjë · tërhiqni për të zhvendosur.'}
            </span>
          </div>
        )}
        <div className={`grid gap-4 ${panels.length === 2 ? 'lg:grid-cols-2' : ''}`}>
          {runs &&
            panels.map((k) => {
              const steps = k === 'd' ? runs.d : runs.b;
              const s = steps[Math.min(t, steps.length - 1)];
              const final = steps[steps.length - 1];
              return (
                <AlgoPanel
                  key={k}
                  kind={k}
                  step={s}
                  final={final}
                  finished={t >= steps.length - 1}
                  nodes={nodes}
                  edges={allEdges}
                  extra={negCycle && preset.negCycle ? allEdges.length - 1 : -1}
                  directed={directed}
                  preset={preset}
                  src={src}
                  dst={dst}
                  pending={pending}
                  onBackground={edit ? addNode : undefined}
                  onNode={edit ? clickNode : undefined}
                  onEdge={edit && tool === 'delete' ? clickEdge : undefined}
                  onMove={(id, x, y) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x, y } : n)))}
                />
              );
            })}
        </div>
        <p className="text-xs text-muted">{preset.note}</p>
      </div>
    </VizShell>
  );
}

function AlgoPanel({
  kind,
  step: s,
  final,
  finished,
  nodes,
  edges,
  extra,
  directed,
  preset,
  src,
  dst,
  pending,
  onBackground,
  onNode,
  onEdge,
  onMove,
}: {
  kind: 'd' | 'b';
  step: PathStep;
  final: PathStep;
  finished: boolean;
  nodes: GNode[];
  edges: GEdge[];
  extra: number;
  directed: boolean;
  preset: PathPreset;
  src: string;
  dst: string;
  pending: string | null;
  onBackground?: (x: number, y: number) => void;
  onNode?: (id: string) => void;
  onEdge?: (i: number) => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const path = finished && !final.negativeCycle && final.dist[dst] !== Infinity ? pathTo(final.prev, src, dst) : null;
  const pathEdges = new Set<number>();
  if (path)
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i],
        b = path[i + 1];
      let best = -1;
      edges.forEach((e, k) => {
        if ((e.u === a && e.v === b) || (!directed && e.u === b && e.v === a))
          if (best < 0 || (e.w ?? 0) < (edges[best].w ?? 0)) best = k;
      });
      if (best >= 0) pathEdges.add(best);
    }
  const prevEdges = new Set<number>();
  for (const [v, u] of Object.entries(s.prev)) {
    if (!u) continue;
    edges.forEach((e, k) => {
      if ((e.u === u && e.v === v) || (!directed && e.u === v && e.v === u)) prevEdges.add(k);
    });
  }

  const nodeLook = (n: GNode): NodeLook => {
    const d = s.dist[n.id];
    const settled = s.settled.includes(n.id);
    const updated = s.updated.includes(n.id);
    return {
      fill:
        n.id === s.current
          ? soft('var(--viz-active)', 30)
          : updated
            ? soft('var(--viz-compare)', 35)
            : settled
              ? soft('var(--viz-done)')
              : undefined,
      stroke:
        pending === n.id
          ? 'var(--viz-active)'
          : n.id === src
            ? 'var(--viz-active)'
            : n.id === dst
              ? 'var(--viz-reject)'
              : settled
                ? 'var(--viz-done)'
                : undefined,
      strokeWidth: n.id === src || n.id === dst ? 3 : 2,
      ring: n.id === s.current || pending === n.id ? 'var(--viz-active)' : undefined,
      sub: inf(d),
      subTone: updated ? 'warning' : settled || (finished && d !== Infinity) ? 'success' : 'default',
    };
  };
  const edgeLook = (e: GEdge, i: number): EdgeLook => {
    const neg = (e.w ?? 0) < 0;
    const label = String(e.w);
    if (i === s.relaxing) return { stroke: 'var(--viz-compare)', width: 4, label, labelTone: 'warning', front: true };
    if (pathEdges.has(i))
      return { stroke: 'var(--viz-active)', width: 5, label, labelTone: 'accent', front: true, animated: true };
    if (i === extra) return { stroke: 'var(--viz-reject)', width: 3, dash: '6 5', label, labelTone: 'danger' };
    if (prevEdges.has(i) && !finished)
      return { stroke: 'var(--viz-done)', width: 3, label, labelTone: neg ? 'danger' : 'success' };
    return { label, labelTone: neg ? 'danger' : 'muted' };
  };

  const isD = kind === 'd';
  const negative = edges.some((e) => (e.w ?? 0) < 0);
  const ids = nodes.map((n) => n.id).sort(natural);

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{isD ? 'Dijkstra' : 'Bellman-Ford'}</span>
          <Chip size="sm" variant="soft">
            {isD ? 'O((V+E) log V)' : 'O(V·E)'}
          </Chip>
        </div>
        <div className="flex items-center gap-1.5">
          {isD && negative && (
            <Chip size="sm" color="danger" variant="soft">
              w &lt; 0 — e pasigurt
            </Chip>
          )}
          {!isD && s.iteration !== undefined && s.iteration > 0 && (
            <Chip size="sm" variant="soft" color="accent">
              iterimi {s.iteration}
            </Chip>
          )}
          {finished && final.negativeCycle && (
            <Chip size="sm" color="danger" variant="soft">
              cikël negativ
            </Chip>
          )}
          {finished && !final.negativeCycle && (
            <Chip size="sm" color="success" variant="soft">
              përfundoi
            </Chip>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-[var(--viz-canvas)] bg-grid">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          directed={directed}
          width={preset.w}
          height={preset.h}
          shape={preset.pill ? 'pill' : 'circle'}
          nodeLook={nodeLook}
          edgeLook={edgeLook}
          onBackgroundClick={onBackground}
          onNodeClick={onNode}
          onEdgeClick={onEdge}
          onNodeMove={onMove}
          maxHeight="520px"
          ariaLabel={`${isD ? 'Dijkstra' : 'Bellman-Ford'} nga ${src}`}
        />
      </div>
      <StepNote
        text={s.note}
        tone={finished ? (final.negativeCycle || (isD && negative) ? 'danger' : 'success') : 'accent'}
      />
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="text-muted">
              <th className="py-1 pr-2 text-left font-medium">kulmi</th>
              {ids.map((id) => (
                <th key={id} className="px-1.5 py-1 text-center font-semibold">
                  {id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-1 pr-2 text-muted">dist</td>
              {ids.map((id) => (
                <td
                  key={id}
                  className={`rounded-md px-1.5 py-1 text-center tabular-nums ${s.updated.includes(id) ? 'bg-warning-soft font-bold text-warning' : ''}`}
                >
                  {inf(s.dist[id])}
                </td>
              ))}
            </tr>
            <tr>
              <td className="py-1 pr-2 text-muted">prev</td>
              {ids.map((id) => (
                <td key={id} className="px-1.5 py-1 text-center text-muted">
                  {s.prev[id] ?? '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          Relaksime: <b className="font-mono text-foreground">{s.relaxations}</b>
        </span>
        {path && (
          <span>
            Rruga {src} → {dst}: <b className="text-foreground">{path.join(' → ')}</b> ={' '}
            <b className="font-mono text-foreground">{final.dist[dst]}</b>
          </span>
        )}
      </div>
    </div>
  );
}

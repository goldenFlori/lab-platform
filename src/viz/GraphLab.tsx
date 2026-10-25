import { Button, Chip, Input } from '@heroui/react';
import {
  Boxes,
  Eraser,
  GitFork,
  MousePointerClick,
  Network,
  Route,
  Sigma,
  Table2,
  Trash2,
  Waypoints,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  bfsSteps,
  bipartite,
  dfsSteps,
  isClique,
  isIndependent,
  kruskalSteps,
  largest,
  type MstStep,
  natural,
  primSteps,
  properties,
  type TraversalStep,
} from './algorithms/graphs';
import { GRAPHS_TEXT } from './algorithms/graphs.text';
import { traversalQuestion } from './algorithms/predict';
import { PREDICT_TEXT } from './algorithms/predict.text';
import { Choice, Field, PlayerBar, Segmented, Toggle } from './kit/controls';
import { type EdgeLook, fitLayout, type GEdge, type GNode, GraphCanvas, type NodeLook } from './kit/GraphCanvas';
import { must } from './kit/must';
import { PredictPanel, usePredict } from './kit/predict';
import { Legend, Panel, Pseudocode, Stat, StepNote, TokenRow, VizShell } from './kit/shell';
import { bilingual, useText } from './kit/text';
import { playerKeys, usePlayer } from './kit/usePlayer';

/* =====================================================================
 *  GraphLab — Laboratori 4 & 5 (Leksioni 4)
 *  Build a graph, read its properties and representations, analyse it,
 *  then traverse it (BFS/DFS) or find its minimum spanning tree.
 * ===================================================================== */

export type GraphMode = 'build' | 'repr' | 'analyze' | 'traverse' | 'mst';

interface Preset {
  id: string;
  directed?: boolean;
  weighted?: boolean;
  multi?: boolean;
  nodes: GNode[];
  edges: GEdge[];
}

const W = 720;
const H = 420;
const lay = (pts: [string, number, number][]) =>
  fitLayout(
    pts.map(([id, x, y]) => ({ id, x, y })),
    W,
    H,
    64,
  );
const E = (list: (string | number)[][]): GEdge[] =>
  list.map(([u, v, w]) => ({ u: String(u), v: String(v), ...(w !== undefined ? { w: Number(w) } : {}) }));

export const GRAPH_PRESETS: Preset[] = [
  {
    id: 'shembull',
    nodes: lay([
      ['A', 120, 120],
      ['B', 300, 60],
      ['C', 480, 120],
      ['D', 120, 300],
      ['E', 300, 360],
      ['F', 480, 300],
    ]),
    edges: E([
      ['A', 'B'],
      ['B', 'C'],
      ['A', 'D'],
      ['B', 'E'],
      ['C', 'F'],
      ['D', 'E'],
      ['E', 'F'],
    ]),
  },
  {
    id: 'klase1',
    nodes: lay([
      ['0', 300, 40],
      ['1', 170, 130],
      ['2', 430, 130],
      ['3', 250, 235],
      ['4', 470, 240],
      ['5', 340, 330],
    ]),
    edges: E([
      ['0', '1'],
      ['0', '2'],
      ['1', '3'],
      ['2', '3'],
      ['2', '4'],
      ['3', '5'],
      ['4', '5'],
    ]),
  },
  {
    id: 'klase2',
    weighted: true,
    nodes: lay([
      ['A', 300, 45],
      ['B', 140, 165],
      ['C', 420, 160],
      ['D', 200, 320],
      ['E', 450, 310],
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
  },
  {
    id: 'mst8',
    weighted: true,
    nodes: lay([
      ['A', 80, 200],
      ['B', 220, 70],
      ['C', 220, 330],
      ['D', 380, 200],
      ['E', 520, 70],
      ['F', 520, 330],
      ['G', 660, 200],
      ['H', 380, 40],
    ]),
    edges: E([
      ['A', 'B', 4],
      ['A', 'C', 8],
      ['B', 'C', 11],
      ['B', 'D', 8],
      ['C', 'D', 7],
      ['B', 'H', 6],
      ['H', 'E', 3],
      ['D', 'E', 2],
      ['D', 'F', 6],
      ['C', 'F', 1],
      ['E', 'F', 9],
      ['E', 'G', 4],
      ['F', 'G', 10],
    ]),
  },
  {
    id: 'k4',
    nodes: lay([
      ['A', 200, 80],
      ['B', 440, 80],
      ['C', 440, 320],
      ['D', 200, 320],
    ]),
    edges: E([
      ['A', 'B'],
      ['A', 'C'],
      ['A', 'D'],
      ['B', 'C'],
      ['B', 'D'],
      ['C', 'D'],
    ]),
  },
  {
    id: 'konigsberg',
    multi: true,
    nodes: lay([
      ['C', 200, 40],
      ['A', 330, 200],
      ['B', 200, 360],
      ['D', 600, 200],
    ]),
    edges: E([
      ['A', 'C'],
      ['A', 'C'],
      ['A', 'B'],
      ['A', 'B'],
      ['A', 'D'],
      ['C', 'D'],
      ['B', 'D'],
    ]),
  },
  {
    id: 'katror',
    nodes: lay([
      ['A', 220, 90],
      ['B', 480, 90],
      ['C', 480, 330],
      ['D', 220, 330],
    ]),
    edges: E([
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'D'],
      ['D', 'A'],
    ]),
  },
  {
    id: 'c5',
    nodes: lay([
      ['A', 360, 40],
      ['B', 560, 170],
      ['C', 480, 360],
      ['D', 240, 360],
      ['E', 160, 170],
    ]),
    edges: E([
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'D'],
      ['D', 'E'],
      ['E', 'A'],
    ]),
  },
  {
    id: 'digraf',
    directed: true,
    nodes: lay([
      ['MAT1', 80, 120],
      ['MAT2', 260, 60],
      ['PRG1', 260, 220],
      ['ALG', 440, 60],
      ['PRG2', 440, 220],
      ['DB', 620, 140],
    ]),
    edges: E([
      ['MAT1', 'MAT2'],
      ['MAT1', 'PRG1'],
      ['MAT2', 'ALG'],
      ['PRG1', 'PRG2'],
      ['ALG', 'DB'],
      ['PRG2', 'DB'],
    ]),
  },
  { id: 'bosh', nodes: [], edges: [] },
];

const MODES: { value: GraphMode; icon: React.ReactNode }[] = [
  { value: 'build', icon: <MousePointerClick className="size-4" /> },
  { value: 'repr', icon: <Table2 className="size-4" /> },
  { value: 'analyze', icon: <Boxes className="size-4" /> },
  { value: 'traverse', icon: <Route className="size-4" /> },
  { value: 'mst', icon: <GitFork className="size-4" /> },
];

const TEXT = bilingual(
  {
    presets: {
      shembull: { name: 'Shembull — 6 kulme', note: 'Një graf i thjeshtë i padrejtuar.' },
      klase1: { name: 'Punë në Klasë 1 — BFS/DFS', note: 'Grafi i Problemit 1 të Punës në Klasë, Laboratori 5.' },
      klase2: {
        name: 'Punë në Klasë 2 — Kruskal',
        note: 'Grafi me pesha i Problemit 2 të Punës në Klasë, Laboratori 5.',
      },
      mst8: { name: 'Rrjet me pesha — 8 kulme', note: 'Lidhni 8 qytete me kabllo me kosto minimale.' },
      k4: { name: 'Grafi i plotë K₄', note: 'Çdo çift kulmesh është i lidhur: |E| = n(n−1)/2 = 6.' },
      konigsberg: { name: 'Urat e Königsbergut', note: 'Multigraf: 4 pjesë qyteti, 7 ura (Leksioni 4, slides 2–3).' },
      katror: { name: 'Katror C₄ — dyanësor', note: 'Shtoni një diagonale dhe kontrolloni sërish dyanësinë.' },
      c5: { name: 'Cikël C₅ — cikël tek', note: 'Një cikël me gjatësi tek nuk është kurrë dyanësor.' },
      digraf: { name: 'Digraf — lëndët', note: 'Harqet tregojnë cila lëndë kërkohet para cilës.' },
      bosh: { name: 'Graf bosh', note: 'Klikoni në fushë për të shtuar kulme.' },
    } as Record<string, { name: string; note: string }>,
    modes: {
      build: 'Ndërto',
      repr: 'Paraqitjet',
      analyze: 'Analizo',
      traverse: 'BFS / DFS',
      mst: 'Pema minimale',
    } as Record<GraphMode, string>,
    pseudo: {
      bfs: [
        'shëno s; radha = [s]',
        'ndërsa radha ≠ ∅:',
        '  v = nxirr nga fillimi',
        '  për çdo fqinj w i pavizituar:',
        '    shëno w; fute në fund',
      ],
      dfs: ['stiva = [s]', 'ndërsa stiva ≠ ∅:', '  v = nxirr nga maja; vizito v', '  shty fqinjët e pavizituar'],
      kruskal: [
        'rendit brinjët sipas peshës',
        'për çdo brinjë (u, v):',
        '  find(u) ≠ find(v) → prano',
        '  përndryshe → refuzo (cikël)',
      ],
      prim: ['T = {s}', 'gjej brinjën më të lehtë', '  që del nga T; shtoje në T'],
    },
    addVertices: 'Shtoni kulme për të nisur.',
    max: 'Maksimumi është 20 kulme.',
    added: (id: string) => `U shtua kulmi **${id}**. Klikoni dy kulme radhazi për të shtuar një brinjë.`,
    removed: (id: string) => `U fshi kulmi **${id}** bashkë me brinjët e tij.`,
    picked: (id: string, multi: boolean) =>
      `Zgjodhët **${id}**. Klikoni kulmin tjetër${multi ? ` (ose sërish ${id} për një lak)` : ''}.`,
    loops: 'Laqet lejohen vetëm kur aktivizoni **Multigraf**.',
    exists: (u: string, v: string) => `Brinja ${u}–${v} ekziston. Për brinjë paralele aktivizoni **Multigraf**.`,
    loopAdded: (u: string) => `U shtua një **lak** te ${u}: fuqia e tij rritet me 2.`,
    edgeAdded: (edge: string, w: number | null) => `U shtua brinja **${edge}**${w !== null ? ` me peshë ${w}` : ''}.`,
    edgeRemoved: (u: string, v: string) => `U fshi brinja ${u}–${v}.`,
    level: (n: number) => `niv ${n}`,
    bipartite: 'Grafi **është dyanësor**: kulmet ndahen në X dhe Y dhe çdo brinjë lidh X me Y.',
    loopNotBipartite: (v: string) => `**Nuk është dyanësor**: ka një lak te ${v}.`,
    oddCycle: (cycle: string, first: string, n: number) =>
      `**Nuk është dyanësor**: cikli tek ${cycle} – ${first} (gjatësia ${n}).`,
    selectHint:
      'Klikoni kulme për t’i zgjedhur. Kontrollojmë menjëherë nëse formojnë **bashkësi të pavarur** apo **klikë**.',
    selection: (set: string, independent: boolean, clique: boolean) =>
      `Zgjedhja {${set}}: ${independent ? '**bashkësi e pavarur** (asnjë brinjë brenda)' : 'jo e pavarur'} · ${clique ? '**klikë** (çdo çift i lidhur)' : 'jo klikë'}.`,
    needWeights: 'Aktivizoni **Me pesha** për të parë pemën përfshirëse minimale.',
    undirectedOnly: 'Kruskal dhe Prim punojnë me grafe të padrejtuara.',
    title: 'Laboratori i grafeve',
    subtitle:
      'Ndërtoni një graf, lexoni vetitë dhe paraqitjet e tij, analizojeni, pastaj përshkojeni ose gjeni pemën minimale.',
    mode: 'Mënyra',
    graph: 'Grafi',
    directed: 'I drejtuar',
    weighted: 'Me pesha',
    multigraph: 'Multigraf',
    tool: 'Mjeti',
    addConnect: 'Shto / lidh',
    erase: 'Fshi',
    newWeight: 'pesha e brinjës së re',
    newWeightLabel: 'Pesha e brinjës së re',
    cleared: 'Grafi u pastrua. Klikoni në fushë për të shtuar kulme.',
    clear: 'Pastro',
    hideBipartite: 'Fshih dyanësinë',
    checkBipartite: 'Kontrollo dyanësinë',
    maxClique: 'Klika maksimale',
    maxIndependent: 'Bashkësia maksimale e pavarur',
    clearSelection: 'Pastro zgjedhjen',
    algorithm: 'Algoritmi',
    bfsQueue: 'BFS — radhë',
    dfsStack: 'DFS — stivë',
    startVertex: 'Kulmi fillestar',
    startFrom: (v: string) => `nis nga ${v}`,
    graphLabel: (n: number, m: number) => `Graf me ${n} kulme dhe ${m} brinjë`,
    editHelp: 'Klikoni në fushë → kulm i ri · klikoni dy kulme → brinjë · tërhiqni një kulm për ta zhvendosur.',
    current: 'Kulmi aktual / brinjë e pemës',
    inQueue: 'Në radhë',
    inStack: 'Në stivë',
    visited: 'I vizituar (me numrin e radhës)',
    inTree: 'Në pemë',
    considering: 'Po shqyrtohet',
    rejected: 'Refuzuar (cikël)',
    chosen: 'Zgjedhja',
    independent: 'e pavarur',
    clique: 'klikë',
    pseudocode: 'Pseudokodi',
    queue: 'Radha (FIFO)',
    stack: 'Stiva (LIFO) — maja djathtas',
    visitOrder: 'Rendi i vizitës',
    treeWeight: 'Pesha w(T)',
    treeEdges: 'Brinjë në pemë',
    accepted: 'Brinjët e pranuara',
    order: 'Rendi |V|',
    size: 'Përmasa |E|',
    handshake: 'Lema e shtrëngimit të duarve',
    oddVertices: 'Kulme me fuqi tek:',
    alwaysEven: '— gjithmonë një numër çift.',
    kind: 'Lloji i grafit',
    simple: 'Graf i thjeshtë',
    loopsCount: (n: number) => `${n} lak`,
    parallel: (n: number) => `${n} brinjë paralele`,
    digraph: 'Digraf',
    undirected: 'I padrejtuar',
    complete: (n: number) => `I plotë K${n}`,
    regular: (k: number) => `${k}-i rregullt`,
    connected: 'I lidhur',
    components: (n: number) => `${n} komponente`,
    euler: 'Udhë Euleri (çdo brinjë një herë):',
    exists2: 'ekziston',
    notExists: 'nuk ekziston',
    oddCount: (n: number) => `— ${n} kulme tek.`,
    adjacencyList: 'Lista e fqinjësisë',
    empty: 'Grafi është bosh.',
    weightMatrix: 'Matrica e peshave',
    adjacencyMatrix: 'Matrica e fqinjësisë',
    directedMatrix: 'Rreshti = origjina, kolona = destinacioni — matrica nuk është simetrike.',
    undirectedMatrix:
      'Graf i padrejtuar → matricë simetrike. Laku numërohet 2 herë në diagonale, që shuma e rreshtit = fuqia.',
    reminder: 'Kujtesa (Leksioni 4, slide 56)',
    matrix: 'Matrica',
    list: 'Lista',
  },
  {
    presets: {
      shembull: { name: 'Example — 6 vertices', note: 'A simple undirected graph.' },
      klase1: { name: 'Class work 1 — BFS/DFS', note: 'The graph of Class work Problem 1, Lab 5.' },
      klase2: { name: 'Class work 2 — Kruskal', note: 'The weighted graph of Class work Problem 2, Lab 5.' },
      mst8: { name: 'Weighted network — 8 vertices', note: 'Connect 8 cities with cables at minimum cost.' },
      k4: { name: 'The complete graph K₄', note: 'Every pair of vertices is connected: |E| = n(n−1)/2 = 6.' },
      konigsberg: {
        name: 'The bridges of Königsberg',
        note: 'A multigraph: 4 parts of the city, 7 bridges (Lecture 4, slides 2–3).',
      },
      katror: { name: 'Square C₄ — bipartite', note: 'Add a diagonal and check bipartiteness again.' },
      c5: { name: 'Cycle C₅ — an odd cycle', note: 'A cycle of odd length is never bipartite.' },
      digraf: { name: 'Digraph — courses', note: 'The edges show which course is required before which.' },
      bosh: { name: 'Empty graph', note: 'Click the canvas to add vertices.' },
    },
    modes: { build: 'Build', repr: 'Representations', analyze: 'Analyze', traverse: 'BFS / DFS', mst: 'Minimum tree' },
    pseudo: {
      bfs: [
        'mark s; queue = [s]',
        'while queue ≠ ∅:',
        '  v = take from the front',
        '  for each unvisited neighbour w:',
        '    mark w; add it to the back',
      ],
      dfs: ['stack = [s]', 'while stack ≠ ∅:', '  v = pop from the top; visit v', '  push the unvisited neighbours'],
      kruskal: [
        'sort the edges by weight',
        'for each edge (u, v):',
        '  find(u) ≠ find(v) → accept',
        '  otherwise → reject (cycle)',
      ],
      prim: ['T = {s}', 'find the lightest edge', '  leaving T; add it to T'],
    },
    addVertices: 'Add vertices to begin.',
    max: 'The maximum is 20 vertices.',
    added: (id) => `Added the vertex **${id}**. Click two vertices in turn to add an edge.`,
    removed: (id) => `Deleted the vertex **${id}** together with its edges.`,
    picked: (id, multi) =>
      `You picked **${id}**. Click the other vertex${multi ? ` (or ${id} again for a loop)` : ''}.`,
    loops: 'Loops are allowed only when **Multigraph** is on.',
    exists: (u, v) => `The edge ${u}–${v} exists. For parallel edges turn on **Multigraph**.`,
    loopAdded: (u) => `Added a **loop** at ${u}: its degree grows by 2.`,
    edgeAdded: (edge, w) => `Added the edge **${edge}**${w !== null ? ` with weight ${w}` : ''}.`,
    edgeRemoved: (u, v) => `Deleted the edge ${u}–${v}.`,
    level: (n) => `lvl ${n}`,
    bipartite: 'The graph **is bipartite**: the vertices split into X and Y and every edge joins X to Y.',
    loopNotBipartite: (v) => `**Not bipartite**: there is a loop at ${v}.`,
    oddCycle: (cycle, first, n) => `**Not bipartite**: the odd cycle ${cycle} – ${first} (length ${n}).`,
    selectHint:
      'Click vertices to select them. We check at once whether they form an **independent set** or a **clique**.',
    selection: (set, independent, clique) =>
      `Selection {${set}}: ${independent ? '**independent set** (no edge inside)' : 'not independent'} · ${clique ? '**clique** (every pair connected)' : 'not a clique'}.`,
    needWeights: 'Turn on **Weighted** to see the minimum spanning tree.',
    undirectedOnly: 'Kruskal and Prim work on undirected graphs.',
    title: 'The graph lab',
    subtitle:
      'Build a graph, read its properties and representations, analyze it, then traverse it or find the minimum tree.',
    mode: 'Mode',
    graph: 'Graph',
    directed: 'Directed',
    weighted: 'Weighted',
    multigraph: 'Multigraph',
    tool: 'Tool',
    addConnect: 'Add / connect',
    erase: 'Delete',
    newWeight: 'weight of the new edge',
    newWeightLabel: 'Weight of the new edge',
    cleared: 'The graph was cleared. Click the canvas to add vertices.',
    clear: 'Clear',
    hideBipartite: 'Hide bipartiteness',
    checkBipartite: 'Check bipartiteness',
    maxClique: 'Maximum clique',
    maxIndependent: 'Maximum independent set',
    clearSelection: 'Clear the selection',
    algorithm: 'Algorithm',
    bfsQueue: 'BFS — queue',
    dfsStack: 'DFS — stack',
    startVertex: 'Start vertex',
    startFrom: (v) => `start from ${v}`,
    graphLabel: (n, m) => `A graph with ${n} vertices and ${m} edges`,
    editHelp: 'Click the canvas → new vertex · click two vertices → edge · drag a vertex to move it.',
    current: 'Current vertex / tree edge',
    inQueue: 'In the queue',
    inStack: 'On the stack',
    visited: 'Visited (with its number in the order)',
    inTree: 'In the tree',
    considering: 'Being considered',
    rejected: 'Rejected (cycle)',
    chosen: 'Selection',
    independent: 'independent',
    clique: 'clique',
    pseudocode: 'Pseudocode',
    queue: 'Queue (FIFO)',
    stack: 'Stack (LIFO) — top on the right',
    visitOrder: 'Visiting order',
    treeWeight: 'Weight w(T)',
    treeEdges: 'Edges in the tree',
    accepted: 'Accepted edges',
    order: 'Order |V|',
    size: 'Size |E|',
    handshake: 'The handshake lemma',
    oddVertices: 'Vertices of odd degree:',
    alwaysEven: '— always an even number.',
    kind: 'Kind of graph',
    simple: 'Simple graph',
    loopsCount: (n) => `${n} ${n === 1 ? 'loop' : 'loops'}`,
    parallel: (n) => `${n} parallel ${n === 1 ? 'edge' : 'edges'}`,
    digraph: 'Digraph',
    undirected: 'Undirected',
    complete: (n) => `Complete K${n}`,
    regular: (k) => `${k}-regular`,
    connected: 'Connected',
    components: (n) => `${n} components`,
    euler: 'Euler trail (every edge once):',
    exists2: 'exists',
    notExists: 'does not exist',
    oddCount: (n) => `— ${n} odd vertices.`,
    adjacencyList: 'Adjacency list',
    empty: 'The graph is empty.',
    weightMatrix: 'Weight matrix',
    adjacencyMatrix: 'Adjacency matrix',
    directedMatrix: 'Row = origin, column = destination — the matrix is not symmetric.',
    undirectedMatrix:
      'Undirected graph → symmetric matrix. A loop counts 2 on the diagonal, so that the row sum = the degree.',
    reminder: 'Reminder (Lecture 4, slide 56)',
    matrix: 'Matrix',
    list: 'List',
  },
);

const soft = (c: string, p = 22) => `color-mix(in oklab, ${c} ${p}%, var(--surface))`;

function nextLabel(nodes: GNode[]) {
  const used = new Set(nodes.map((n) => n.id));
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i);
    if (!used.has(c)) return c;
  }
  let k = 1;
  while (used.has(String(k))) k++;
  return String(k);
}

export default function GraphLab({
  mode: initialMode = 'build',
  preset: initialPreset = 'shembull',
  title,
}: {
  mode?: GraphMode;
  preset?: string;
  title?: string;
}) {
  const X = useText(TEXT);
  const G = useText(GRAPHS_TEXT);
  const start = GRAPH_PRESETS.find((p) => p.id === initialPreset) ?? GRAPH_PRESETS[0];
  const [mode, setMode] = useState<GraphMode>(initialMode);
  const [presetId, setPresetId] = useState(start.id);
  const [nodes, setNodes] = useState<GNode[]>(start.nodes);
  const [edges, setEdges] = useState<GEdge[]>(start.edges);
  const [directed, setDirected] = useState(!!start.directed);
  const [weighted, setWeighted] = useState(!!start.weighted);
  const [multi, setMulti] = useState(!!start.multi);
  const [tool, setTool] = useState<'edit' | 'delete'>('edit');
  const [pending, setPending] = useState<string | null>(null);
  const [newW, setNewW] = useState('1');
  const [hint, setHint] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [showBip, setShowBip] = useState(false);
  const [trav, setTrav] = useState<'bfs' | 'dfs'>('bfs');
  const [mstAlgo, setMstAlgo] = useState<'kruskal' | 'prim'>('kruskal');
  const [startId, setStartId] = useState(start.nodes[0]?.id ?? '');

  const loadPreset = (id: string) => {
    const p = must(
      GRAPH_PRESETS.find((x) => x.id === id),
      'preset',
    );
    setPresetId(id);
    setNodes(p.nodes);
    setEdges(p.edges);
    setDirected(!!p.directed);
    setWeighted(!!p.weighted);
    setMulti(!!p.multi);
    setPending(null);
    setSelection([]);
    setShowBip(false);
    setStartId(p.nodes[0]?.id ?? '');
    setHint(X.presets[p.id]?.note ?? null);
  };

  /* ---- structure-only keys: dragging a vertex must not restart the animation ---- */
  const idsKey = nodes.map((n) => n.id).join(',');
  const edgesKey = edges.map((e) => `${e.u}>${e.v}:${e.w ?? ''}`).join(',');
  const startOk = nodes.some((n) => n.id === startId) ? startId : (nodes[0]?.id ?? '');

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the graph's structure, so dragging a vertex does not restart the animation
  const travSteps = useMemo<TraversalStep[]>(
    () =>
      startOk
        ? (trav === 'bfs' ? bfsSteps : dfsSteps)(nodes, edges, directed, startOk, G)
        : [
            {
              note: X.addVertices,
              current: null,
              visited: [],
              frontier: [],
              order: [],
              tree: [],
              considering: null,
            },
          ],
    [idsKey, edgesKey, directed, trav, startOk],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the graph's structure, so dragging a vertex does not restart the animation
  const mstSteps = useMemo<MstStep[]>(
    () =>
      nodes.length === 0
        ? [{ note: X.addVertices, tree: [], rejected: [], considering: null, inTree: [], weight: 0 }]
        : mstAlgo === 'kruskal'
          ? kruskalSteps(nodes, edges, G)
          : primSteps(nodes, edges, startOk, G),
    [idsKey, edgesKey, mstAlgo, startOk, X, G],
  );
  const travPlayer = usePlayer(travSteps, 950);
  const mp = usePlayer(mstSteps, 950);
  // Predict mode (#127): which vertex leaves the queue (BFS) or the stack (DFS).
  const P = useText(PREDICT_TEXT);
  const travQuestion = useCallback((k: number) => traversalQuestion(travSteps, k, trav, P), [travSteps, trav, P]);
  const predict = usePredict(travPlayer, travQuestion, travSteps, 950);
  const tp = predict.player;
  const props = useMemo(() => properties(nodes, edges, directed), [nodes, edges, directed]);
  const bip = useMemo(() => (showBip ? bipartite(nodes, edges) : null), [showBip, nodes, edges]);

  /* ---- editing ---- */
  const editable = mode === 'build' || mode === 'repr';
  const addNode = (x: number, y: number) => {
    if (!editable || tool !== 'edit') return;
    if (nodes.length >= 20) return setHint(X.max);
    const id = nextLabel(nodes);
    setNodes([...nodes, { id, x, y }]);
    setHint(X.added(id));
  };
  const clickNode = (id: string) => {
    if (mode === 'analyze') {
      setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].sort(natural)));
      return;
    }
    if (mode === 'traverse' || mode === 'mst') {
      setStartId(id);
      return;
    }
    if (tool === 'delete') {
      setNodes(nodes.filter((n) => n.id !== id));
      setEdges(edges.filter((e) => e.u !== id && e.v !== id));
      setHint(X.removed(id));
      return;
    }
    if (!pending) {
      setPending(id);
      setHint(X.picked(id, multi));
      return;
    }
    const u = pending;
    setPending(null);
    if (u === id && !multi) return setHint(X.loops);
    const exists = edges.some((e) => (e.u === u && e.v === id) || (!directed && e.u === id && e.v === u));
    if (exists && !multi) return setHint(X.exists(u, id));
    const w = Math.max(-99, Math.min(999, Math.round(Number(newW) || 1)));
    setEdges([...edges, { u, v: id, ...(weighted ? { w } : {}) }]);
    setHint(u === id ? X.loopAdded(u) : X.edgeAdded(`${u}${directed ? '→' : '–'}${id}`, weighted ? w : null));
  };
  const clickEdge = (i: number) => {
    if (!editable || tool !== 'delete') return;
    const e = edges[i];
    setEdges(edges.filter((_, k) => k !== i));
    setHint(X.edgeRemoved(e.u, e.v));
  };
  const moveNode = (id: string, x: number, y: number) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x, y } : n)));
  const toggleWeighted = (v: boolean) => {
    setWeighted(v);
    if (v) setEdges((es) => es.map((e, i) => ({ ...e, w: e.w ?? ((i * 7) % 9) + 1 })));
  };

  /* ---- looks per mode ---- */
  const ts = tp.step;
  const ms = mp.step;
  const sel = new Set(selection);
  const oddCycle = bip && !bip.ok ? bip.cycle : [];
  const cycleEdge = (e: GEdge) => {
    if (oddCycle.length < 2) return false;
    for (let k = 0; k < oddCycle.length; k++) {
      const a = oddCycle[k],
        b = oddCycle[(k + 1) % oddCycle.length];
      if ((e.u === a && e.v === b) || (e.u === b && e.v === a)) return true;
    }
    return false;
  };

  const nodeLook = (n: GNode): NodeLook => {
    if (mode === 'traverse') {
      const pos = ts.order.indexOf(n.id);
      return {
        fill:
          n.id === ts.current
            ? soft('var(--viz-active)', 30)
            : pos >= 0
              ? soft('var(--viz-done)')
              : ts.frontier.includes(n.id)
                ? soft('var(--viz-compare)')
                : undefined,
        stroke:
          n.id === ts.current
            ? 'var(--viz-active)'
            : pos >= 0
              ? 'var(--viz-done)'
              : ts.frontier.includes(n.id)
                ? 'var(--viz-compare)'
                : n.id === startOk
                  ? 'var(--viz-active)'
                  : undefined,
        ring: n.id === ts.current ? 'var(--viz-active)' : undefined,
        badge: pos >= 0 ? String(pos + 1) : null,
        badgeColor: 'var(--viz-done)',
        sub: trav === 'bfs' && ts.level && n.id in ts.level ? X.level(ts.level[n.id]) : null,
      };
    }
    if (mode === 'mst') {
      const inT =
        ms.inTree.includes(n.id) ||
        (mstAlgo === 'kruskal' && ms.tree.some((i) => edges[i] && (edges[i].u === n.id || edges[i].v === n.id)));
      return {
        fill: inT ? soft('var(--viz-done)') : undefined,
        stroke: inT ? 'var(--viz-done)' : undefined,
        ring: mstAlgo === 'prim' && n.id === startOk && mp.atStart ? 'var(--viz-active)' : undefined,
      };
    }
    if (mode === 'analyze') {
      if (bip) {
        if (!bip.ok && oddCycle.includes(n.id))
          return { fill: soft('var(--viz-reject)', 25), stroke: 'var(--viz-reject)', ring: 'var(--viz-reject)' };
        if (bip.ok)
          return {
            fill: bip.side[n.id] === 0 ? soft('var(--brand)', 26) : soft('var(--brand-2)', 30),
            stroke: bip.side[n.id] === 0 ? 'var(--brand)' : 'var(--brand-2)',
            sub: bip.side[n.id] === 0 ? 'X' : 'Y',
          };
      }
      return sel.has(n.id) ? { fill: soft('var(--viz-active)', 28), stroke: 'var(--viz-active)', strokeWidth: 3 } : {};
    }
    // build / repr
    return {
      ring: pending === n.id ? 'var(--viz-active)' : undefined,
      stroke: pending === n.id ? 'var(--viz-active)' : undefined,
      sub:
        mode === 'build'
          ? directed
            ? `+${props.outDeg[n.id]} −${props.inDeg[n.id]}`
            : `deg ${props.degree[n.id]}`
          : null,
      subTone: mode === 'build' && !directed && props.degree[n.id] % 2 === 1 ? 'warning' : 'default',
    };
  };

  const edgeLook = (e: GEdge, i: number): EdgeLook => {
    const label = weighted && e.w !== undefined ? String(e.w) : null;
    if (mode === 'traverse') {
      if (ts.considering === i) return { stroke: 'var(--viz-compare)', width: 4, label, front: true };
      if (ts.tree.includes(i)) return { stroke: 'var(--viz-active)', width: 4, label, front: true };
      return { label, dim: tp.atEnd };
    }
    if (mode === 'mst') {
      if (ms.considering === i && !ms.tree.includes(i) && !ms.rejected.includes(i))
        return { stroke: 'var(--viz-compare)', width: 4, label, labelTone: 'warning', front: true };
      if (ms.tree.includes(i))
        return { stroke: 'var(--viz-done)', width: 4.5, label, labelTone: 'success', front: true };
      if (ms.rejected.includes(i))
        return { stroke: 'var(--viz-reject)', width: 2, dash: '6 6', label, labelTone: 'danger' };
      return { label };
    }
    if (mode === 'analyze') {
      if (bip && !bip.ok && cycleEdge(e)) return { stroke: 'var(--viz-reject)', width: 4, label, front: true };
      if (!bip && sel.has(e.u) && sel.has(e.v) && e.u !== e.v)
        return { stroke: 'var(--viz-active)', width: 3.5, label, front: true };
      return { label, dim: bip?.ok ? false : undefined };
    }
    return { label };
  };

  /* ---- footer note ---- */
  let note = hint ?? X.presets[presetId]?.note ?? '';
  if (mode === 'analyze') {
    if (bip)
      note = bip.ok
        ? X.bipartite
        : oddCycle.length === 1
          ? X.loopNotBipartite(oddCycle[0])
          : X.oddCycle(oddCycle.join(' – '), oddCycle[0], oddCycle.length);
    else if (!selection.length) note = X.selectHint;
    else note = X.selection(selection.join(', '), isIndependent(edges, selection), isClique(edges, selection));
  }
  if (mode === 'traverse') note = ts.note;
  if (mode === 'mst') note = !weighted ? X.needWeights : directed ? X.undirectedOnly : ms.note;

  const ids = [...nodes].map((n) => n.id).sort(natural);
  const playing = mode === 'traverse' ? tp : mp;

  return (
    <VizShell
      title={title ?? X.title}
      subtitle={X.subtitle}
      icon={<Network />}
      onKeyDown={mode === 'traverse' || mode === 'mst' ? playerKeys(playing) : undefined}
      toolbar={
        <>
          <Field label={X.mode}>
            <Segmented
              label={X.mode}
              value={mode}
              onChange={(m) => {
                setMode(m);
                setPending(null);
                setShowBip(false);
                setHint(null);
              }}
              options={MODES.map((m) => ({ ...m, label: X.modes[m.value] }))}
            />
          </Field>
          <Field label={X.graph}>
            <Choice
              label={X.graph}
              value={presetId}
              onChange={loadPreset}
              options={GRAPH_PRESETS.map((p) => ({ value: p.id, label: X.presets[p.id]?.name ?? p.id }))}
              className="w-60"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-1">
            <Toggle
              label={X.directed}
              value={directed}
              onChange={(v) => {
                setDirected(v);
                setShowBip(false);
              }}
            />
            <Toggle label={X.weighted} value={weighted} onChange={toggleWeighted} />
            <Toggle label={X.multigraph} value={multi} onChange={setMulti} />
          </div>
        </>
      }
      footer={
        <>
          <StepNote text={note} tone={mode === 'analyze' && bip ? (bip.ok ? 'success' : 'danger') : 'accent'} />
          {mode === 'traverse' && <PlayerBar player={tp} />}
          {mode === 'traverse' && <PredictPanel predict={predict} />}
          {mode === 'mst' && weighted && !directed && <PlayerBar player={mp} />}
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex min-w-0 flex-col gap-3">
          {/* contextual controls */}
          <div className="flex flex-wrap items-center gap-2">
            {editable && (
              <>
                <Segmented
                  label={X.tool}
                  value={tool}
                  onChange={(t) => {
                    setTool(t);
                    setPending(null);
                  }}
                  options={[
                    { value: 'edit', label: X.addConnect, icon: <Waypoints className="size-4" /> },
                    { value: 'delete', label: X.erase, icon: <Eraser className="size-4" /> },
                  ]}
                />
                {weighted && (
                  <label className="flex items-center gap-2 text-sm text-muted">
                    {X.newWeight}
                    <Input
                      aria-label={X.newWeightLabel}
                      type="number"
                      value={newW}
                      onChange={(e) => setNewW(e.target.value)}
                      className="w-20 font-mono"
                    />
                  </label>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    setNodes([]);
                    setEdges([]);
                    setPending(null);
                    setHint(X.cleared);
                  }}
                >
                  <Trash2 /> {X.clear}
                </Button>
              </>
            )}
            {mode === 'analyze' && (
              <>
                <Button
                  size="sm"
                  variant={showBip ? 'primary' : 'secondary'}
                  onPress={() => {
                    setShowBip(!showBip);
                    setSelection([]);
                  }}
                >
                  {showBip ? X.hideBipartite : X.checkBipartite}
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  onPress={() => {
                    setShowBip(false);
                    setSelection(largest(nodes, edges, 'clique'));
                  }}
                >
                  {X.maxClique}
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  onPress={() => {
                    setShowBip(false);
                    setSelection(largest(nodes, edges, 'independent'));
                  }}
                >
                  {X.maxIndependent}
                </Button>
                {selection.length > 0 && (
                  <Button size="sm" variant="ghost" onPress={() => setSelection([])}>
                    {X.clearSelection}
                  </Button>
                )}
              </>
            )}
            {mode === 'traverse' && (
              <>
                <Segmented
                  label={X.algorithm}
                  value={trav}
                  onChange={setTrav}
                  options={[
                    { value: 'bfs', label: X.bfsQueue },
                    { value: 'dfs', label: X.dfsStack },
                  ]}
                />
                {ids.length > 0 && (
                  <Choice
                    label={X.startVertex}
                    value={startOk}
                    onChange={setStartId}
                    options={ids.map((i) => ({ value: i, label: X.startFrom(i) }))}
                    className="w-36"
                  />
                )}
              </>
            )}
            {mode === 'mst' && (
              <>
                <Segmented
                  label={X.algorithm}
                  value={mstAlgo}
                  onChange={setMstAlgo}
                  options={[
                    { value: 'kruskal', label: 'Kruskal' },
                    { value: 'prim', label: 'Prim' },
                  ]}
                />
                {mstAlgo === 'prim' && ids.length > 0 && (
                  <Choice
                    label={X.startVertex}
                    value={startOk}
                    onChange={setStartId}
                    options={ids.map((i) => ({ value: i, label: X.startFrom(i) }))}
                    className="w-36"
                  />
                )}
              </>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-[var(--viz-canvas)] bg-grid">
            <GraphCanvas
              nodes={nodes}
              edges={edges}
              directed={directed}
              width={W}
              height={H}
              radius={nodes.some((n) => n.id.length > 2) ? 30 : 21}
              nodeLook={nodeLook}
              edgeLook={edgeLook}
              showWeights={weighted}
              onBackgroundClick={editable ? addNode : undefined}
              onNodeClick={clickNode}
              onEdgeClick={editable && tool === 'delete' ? clickEdge : undefined}
              onNodeMove={moveNode}
              ariaLabel={X.graphLabel(nodes.length, edges.length)}
            />
          </div>
          {editable && <p className="text-xs text-muted">{X.editHelp}</p>}
          {mode === 'traverse' && (
            <Legend
              items={[
                { color: 'var(--viz-active)', label: X.current },
                { color: 'var(--viz-compare)', label: trav === 'bfs' ? X.inQueue : X.inStack },
                { color: 'var(--viz-done)', label: X.visited },
              ]}
            />
          )}
          {mode === 'mst' && (
            <Legend
              items={[
                { color: 'var(--viz-done)', label: X.inTree, shape: 'line' },
                { color: 'var(--viz-compare)', label: X.considering, shape: 'line' },
                { color: 'var(--viz-reject)', label: X.rejected, shape: 'dash' },
              ]}
            />
          )}
        </div>

        <div className="grid min-w-0 content-start gap-3">
          {(mode === 'build' || mode === 'analyze') && <PropertiesPanel props={props} directed={directed} />}
          {mode === 'repr' && (
            <ReprPanel nodes={nodes} edges={edges} ids={ids} directed={directed} weighted={weighted} />
          )}
          {mode === 'analyze' && selection.length > 0 && !bip && (
            <Panel title={X.chosen}>
              <TokenRow items={selection} tone="accent" />
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Chip size="sm" variant="soft" color={isIndependent(edges, selection) ? 'success' : 'default'}>
                  {isIndependent(edges, selection) ? '✓' : '✗'} {X.independent}
                </Chip>
                <Chip size="sm" variant="soft" color={isClique(edges, selection) ? 'success' : 'default'}>
                  {isClique(edges, selection) ? '✓' : '✗'} {X.clique}
                </Chip>
              </div>
            </Panel>
          )}
          {mode === 'traverse' && (
            <>
              <Panel title={X.pseudocode}>
                <Pseudocode lines={X.pseudo[trav]} active={ts.line} />
              </Panel>
              <Panel title={trav === 'bfs' ? X.queue : X.stack}>
                <TokenRow items={ts.frontier} tone="warning" />
              </Panel>
              <Panel title={X.visitOrder}>
                <TokenRow items={ts.order} tone="success" />
              </Panel>
            </>
          )}
          {mode === 'mst' && weighted && !directed && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat label={X.treeWeight} value={ms.weight} tone="success" />
                <Stat label={X.treeEdges} value={`${ms.tree.length} / ${Math.max(0, nodes.length - 1)}`} />
              </div>
              <Panel title={X.pseudocode}>
                <Pseudocode lines={X.pseudo[mstAlgo]} active={ms.line} />
              </Panel>
              <Panel title={X.accepted}>
                <TokenRow items={ms.tree.map((i) => `${edges[i]?.u}–${edges[i]?.v} (${edges[i]?.w})`)} tone="success" />
              </Panel>
            </>
          )}
        </div>
      </div>
    </VizShell>
  );
}

function PropertiesPanel({ props, directed }: { props: ReturnType<typeof properties>; directed: boolean }) {
  const simple = props.loops === 0 && props.parallel === 0;
  const connected = props.components.length <= 1;
  const X = useText(TEXT);
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Stat label={X.order} value={props.order} />
        <Stat label={X.size} value={props.size} />
      </div>
      <Panel title={X.handshake} aside={<Sigma className="size-4 text-muted" />}>
        <p className="font-mono text-sm">
          {directed ? (
            <>
              Σ deg⁺ = Σ deg⁻ = <b>{props.size}</b> = |E|
            </>
          ) : (
            <>
              Σ deg(v) = <b>{props.degreeSum}</b> = 2·|E| = 2·{props.size}{' '}
              {props.degreeSum === 2 * props.size ? '✓' : ''}
            </>
          )}
        </p>
        {!directed && props.order > 0 && (
          <p className="mt-1.5 text-sm text-muted">
            {X.oddVertices} <b className="text-foreground">{props.odd.length}</b>{' '}
            {props.odd.length ? `(${props.odd.join(', ')})` : ''} {X.alwaysEven}
          </p>
        )}
      </Panel>
      <Panel title={X.kind}>
        <div className="flex flex-wrap gap-1.5">
          <Chip size="sm" variant="soft" color={simple ? 'accent' : 'warning'}>
            {simple ? X.simple : X.multigraph}
          </Chip>
          {props.loops > 0 && (
            <Chip size="sm" variant="soft" color="warning">
              {X.loopsCount(props.loops)}
            </Chip>
          )}
          {props.parallel > 0 && (
            <Chip size="sm" variant="soft" color="warning">
              {X.parallel(props.parallel)}
            </Chip>
          )}
          <Chip size="sm" variant="soft">
            {directed ? X.digraph : X.undirected}
          </Chip>
          {props.complete && (
            <Chip size="sm" variant="soft" color="success">
              {X.complete(props.order)}
            </Chip>
          )}
          {props.regular !== null && props.order > 1 && (
            <Chip size="sm" variant="soft" color="success">
              {X.regular(props.regular)}
            </Chip>
          )}
          <Chip size="sm" variant="soft" color={connected ? 'success' : 'danger'}>
            {connected ? X.connected : X.components(props.components.length)}
          </Chip>
        </div>
        {!directed && props.order > 0 && connected && (
          <p className="mt-2.5 text-sm text-muted">
            {X.euler}{' '}
            <b className="text-foreground">
              {props.odd.length === 0 || props.odd.length === 2 ? X.exists2 : X.notExists}
            </b>{' '}
            {X.oddCount(props.odd.length)}
          </p>
        )}
      </Panel>
    </>
  );
}

function ReprPanel({
  edges,
  ids,
  directed,
  weighted,
}: {
  nodes: GNode[];
  edges: GEdge[];
  ids: string[];
  directed: boolean;
  weighted: boolean;
}) {
  const X = useText(TEXT);
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const M: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const Wt: (number | null)[][] = Array.from({ length: n }, () => new Array(n).fill(null));
  const list = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) {
    const a = index.get(e.u),
      b = index.get(e.v);
    if (a === undefined || b === undefined) continue;
    if (a === b) {
      M[a][a] += directed ? 1 : 2;
      list.get(e.u)?.push(weighted ? `${e.v}(${e.w})` : e.v);
      continue;
    }
    M[a][b] += 1;
    Wt[a][b] = e.w ?? null;
    list.get(e.u)?.push(weighted ? `${e.v}(${e.w})` : e.v);
    if (!directed) {
      M[b][a] += 1;
      Wt[b][a] = e.w ?? null;
      list.get(e.v)?.push(weighted ? `${e.u}(${e.w})` : e.u);
    }
  }
  const m = edges.length;
  return (
    <>
      <Panel title={X.adjacencyList}>
        {n === 0 ? (
          <p className="text-sm text-muted">{X.empty}</p>
        ) : (
          <ul className="space-y-1 font-mono text-[0.8rem]">
            {ids.map((id) => (
              <li key={id} className="flex gap-2">
                <span className="w-10 shrink-0 font-semibold">{id}</span>
                <span className="text-muted">→</span>
                <span className="break-words">[{(list.get(id) ?? []).sort(natural).join(', ')}]</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {n > 0 && (
        <Panel title={weighted ? X.weightMatrix : X.adjacencyMatrix}>
          <div className="overflow-x-auto">
            <table className="mx-auto border-collapse font-mono text-[0.74rem]">
              <thead>
                <tr>
                  <th className="p-1" />
                  {ids.map((id) => (
                    <th key={id} className="px-1.5 py-1 font-semibold text-muted">
                      {id}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ids.map((r, i) => (
                  <tr key={r}>
                    <th className="px-1.5 py-1 text-right font-semibold text-muted">{r}</th>
                    {ids.map((c, j) => {
                      const v = weighted ? (i === j && M[i][j] === 0 ? 0 : Wt[i][j]) : M[i][j];
                      const on = weighted ? v !== null && i !== j : (v as number) > 0;
                      return (
                        <td
                          key={c}
                          className={`min-w-7 rounded-md px-1.5 py-1 text-center tabular-nums ${on ? 'bg-accent-soft font-semibold text-accent' : 'text-muted/70'}`}
                        >
                          {v === null ? '·' : v}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">{directed ? X.directedMatrix : X.undirectedMatrix}</p>
        </Panel>
      )}
      <Panel title={X.reminder}>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-xs text-muted">{X.matrix}</div>
            <div className="font-mono font-semibold">n² = {n * n}</div>
          </div>
          <div>
            <div className="text-xs text-muted">{X.list}</div>
            <div className="font-mono font-semibold">
              n + {directed ? 'm' : '2m'} = {n + (directed ? m : 2 * m)}
            </div>
          </div>
        </div>
      </Panel>
    </>
  );
}

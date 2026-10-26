import type { TraceAlgorithm } from '../../shared/trace-problem';
import { bilingual } from '../kit/text';
import type { TraceWords } from './trace';

// The trace tables' words (#150): the columns, the rule each one follows (shown on a wrong cell,
// never the value), and the table's messages.

const sq = {
  words: {
    start: 'Fillimi',
    pass: (n: number) => `Kalimi ${n}`,
    check: (n: number) => `Kalimi ${n} (kontroll)`,
    step: (n: number) => `Hapi ${n}`,
    k: (v: string) => `k = ${v}`,
    cols: {
      chosen: 'Kulmi i zgjedhur',
      dist: (v: string) => `dist[${v}]`,
      changed: 'Ndryshoi diçka?',
      edge: 'Brinja',
      decision: 'Vendimi',
      total: 'Pesha deri tani',
      removed: 'Nxirret',
      queue: 'Radha pas',
    },
    rules: {
      dijkstraChosen: 'Zgjidhet kulmi i patabeluar me distancën më të vogël; në barazim, i pari sipas alfabetit.',
      dijkstraDist:
        'Pasi tabelohet u, për çdo fqinj v të patabeluar: dist[v] = min(dist[v], dist[u] + w(u, v)). Distancat e tjera nuk ndryshojnë.',
      bellmanDist:
        'Në çdo kalim relaksohen të gjitha brinjët sipas rendit të listës, dhe një distancë e përditësuar përdoret menjëherë në të njëjtin kalim.',
      bellmanChanged: 'Shkruani "po" nëse ky kalim përditësoi të paktën një distancë, përndryshe "jo".',
      primEdge:
        'Prim zgjedh brinjën më të lehtë me një skaj në pemë dhe tjetrin jashtë saj; në barazim, të parën sipas alfabetit.',
      kruskalEdge: 'Brinjët shqyrtohen sipas peshës në rend rritës; në barazim, sipas rendit të listës.',
      kruskalDecision:
        'Brinja pranohet nëse find(u) ≠ find(v), domethënë skajet janë në pjesë të ndryshme; përndryshe do të mbyllte cikël.',
      total: 'Pesha deri tani është shuma e peshave të brinjëve të pranuara.',
      kahnRemoved: 'Nxirret kulmi në krye të radhës (FIFO).',
      kahnQueue:
        'Pas nxjerrjes ulet fuqia hyrëse e çdo pasardhësi; ata që arrijnë 0 hyjnë në fund të radhës, sipas rendit të listës së kulmeve. Radha bosh: ∅.',
      floyd: 'D[i][j] = min(D[i][j], D[i][k] + D[k][j]). Rreshti dhe kolona e k nuk ndryshojnë.',
    },
    accept: 'pranohet',
    reject: 'refuzohet',
    yes: 'po',
    no: 'jo',
  } satisfies TraceWords,
  title: 'Tabela e gjurmimit',
  subtitle: 'Plotësoni tabelën rresht pas rreshti, si në letër; çdo rresht kontrollohet sapo e mbaroni.',
  problem: 'Problemi',
  rule: 'Rregulla e barazimit',
  step: 'Rreshti',
  check: 'Kontrollo rreshtin',
  reveal: 'Trego rreshtin',
  replay: 'Rishiko në graf',
  stop: 'Ndalo',
  restart: 'Fillo nga e para',
  matrixAfter: (k: string) => `D pas ${k}`,
  givenMatrix: 'D⁰ (e dhënë)',
  cell: (label: string) => `Qeliza ${label}`,
  status: {
    start: 'Plotësoni rreshtin e parë. Shkruani ∞ për pafundësinë dhe ∅ për radhën bosh.',
    empty: 'Plotësoni të gjitha qelizat e rreshtit para se ta kontrolloni.',
    right: (row: string) => `Saktë: ${row}. Vazhdoni me rreshtin tjetër.`,
    wrong: (cell: string, rule: string) => `Jo ende: **${cell}** nuk është e saktë. ${rule}`,
    revealed: (row: string) => `Rreshti ${row} u tregua. Krahasojeni me tuajin para se të vazhdoni.`,
    done: (right: number, rows: number) =>
      `Tabela është plotë: ${right} nga ${rows} rreshta të saktë që në provën e parë. Klikoni një rresht për ta parë në graf.`,
  },
  custom: {
    name: (algorithm: string) => `Problemi i pedagogut · ${algorithm}`,
    variantName: (algorithm: string) => `Varianti juaj · ${algorithm}`,
    example: 'Shembull: në laborator, çdo student merr grafin e vet',
    variantOf: 'Varianti i',
    mine: 'Juaji',
    key: 'Tabela e pritur e këtij varianti (vetëm për stafin)',
    algorithms: {
      dijkstra: 'Dijkstra',
      bellman: 'Bellman-Ford',
      prim: 'Prim',
      kruskal: 'Kruskal',
      kahn: 'Kahn',
      floyd: 'Floyd-Warshall',
    } as Record<TraceAlgorithm, string>,
    rules: {
      dijkstra: 'Kulmet e barabarta zgjidhen sipas alfabetit.',
      prim: 'Në barazim, merret brinja e parë sipas alfabetit.',
      kruskal: 'Brinjët shqyrtohen sipas peshës; në barazim, sipas rendit të listës.',
      bellman: (edges: string, passes: number) =>
        `Brinjët relaksohen në rendin ${edges}; ${passes} kalime dhe një më shumë si kontroll.`,
      kahn: (order: string) => `Kulmet hyjnë në radhë sipas rendit ${order}.`,
      floyd: (ks: string) => `k merr vlerat ${ks} me radhë; plotësoni të gjithë matricën pas çdo k.`,
    },
  },
  presets: {
    'lab07-dijkstra': {
      name: 'Lab 7 · Dijkstra nga A',
      rule: 'Kulmet e barabarta zgjidhen sipas alfabetit.',
    },
    'lab07-bellman': {
      name: 'Lab 7 · Bellman-Ford nga A',
      rule: 'Brinjët relaksohen në rendin A→B, B→C, B→D, C→D, D→A; 3 kalime dhe një i katërt si kontroll.',
    },
    'lab05-kruskal': {
      name: 'Lab 5 · Kruskal',
      rule: 'Brinjët shqyrtohen sipas peshës; algoritmi ndalet kur pema ka |V| − 1 = 4 brinjë.',
    },
    'lab05-prim': {
      name: 'Lab 5 · Prim nga A',
      rule: 'Në barazim, merret brinja e parë sipas alfabetit.',
    },
    'lab06-kahn': {
      name: 'Lab 6 · Kahn mbi lëndët',
      rule: 'Kulmet hyjnë në radhë sipas rendit MAT1, MAT2, PRG1, ALG1, PRG2, OS, DB, NET.',
    },
    'lab08-floyd': {
      name: 'Lab 8 · Floyd-Warshall me dorë',
      rule: 'k merr vlerat 0, 1, 2, 3 me radhë; plotësoni të gjithë matricën pas çdo k.',
    },
  } as Record<string, { name: string; rule: string }>,
};

export type TraceText = typeof sq;

export const TRACE_TEXT = bilingual<TraceText>(sq, {
  words: {
    start: 'Start',
    pass: (n) => `Pass ${n}`,
    check: (n) => `Pass ${n} (check)`,
    step: (n) => `Step ${n}`,
    k: (v) => `k = ${v}`,
    cols: {
      chosen: 'Vertex chosen',
      dist: (v) => `dist[${v}]`,
      changed: 'Anything changed?',
      edge: 'Edge',
      decision: 'Decision',
      total: 'Weight so far',
      removed: 'Removed',
      queue: 'Queue after',
    },
    rules: {
      dijkstraChosen: 'The unsettled vertex with the smallest distance is chosen; on a tie, the first alphabetically.',
      dijkstraDist:
        'Once u is settled, for each unsettled neighbour v: dist[v] = min(dist[v], dist[u] + w(u, v)). Other distances do not change.',
      bellmanDist:
        'Each pass relaxes every edge in the listed order, and an updated distance is used at once in the same pass.',
      bellmanChanged: 'Write "yes" if this pass updated at least one distance, otherwise "no".',
      primEdge:
        'Prim takes the lightest edge with one end in the tree and the other outside; on a tie, the first alphabetically.',
      kruskalEdge: 'Edges are taken by increasing weight; on a tie, in their listed order.',
      kruskalDecision:
        'An edge is accepted if find(u) ≠ find(v), that is, its ends are in different parts; otherwise it would close a cycle.',
      total: 'The weight so far is the sum of the accepted edges.',
      kahnRemoved: 'The vertex at the front of the queue is removed (FIFO).',
      kahnQueue:
        'After removing it, each successor loses one in-degree; those that reach 0 join the back of the queue, in the order of the vertex list. An empty queue: ∅.',
      floyd: "D[i][j] = min(D[i][j], D[i][k] + D[k][j]). k's row and column do not change.",
    },
    accept: 'accepted',
    reject: 'rejected',
    yes: 'yes',
    no: 'no',
  },
  title: 'Trace table',
  subtitle: 'Fill the table row by row, as on paper; each row is checked as soon as you finish it.',
  problem: 'Problem',
  rule: 'Tie rule',
  step: 'Row',
  check: 'Check the row',
  reveal: 'Show the row',
  replay: 'Replay on the graph',
  stop: 'Stop',
  restart: 'Start over',
  matrixAfter: (k) => `D after ${k}`,
  givenMatrix: 'D⁰ (given)',
  cell: (label) => `Cell ${label}`,
  status: {
    start: 'Fill the first row. Write ∞ for infinity and ∅ for an empty queue.',
    empty: 'Fill every cell of the row before checking it.',
    right: (row) => `Right: ${row}. Go on with the next row.`,
    wrong: (cell, rule) => `Not yet: **${cell}** is not right. ${rule}`,
    revealed: (row) => `Row ${row} was shown. Compare it with yours before going on.`,
    done: (right, rows) =>
      `The table is complete: ${right} of ${rows} rows right at the first try. Click a row to see it on the graph.`,
  },
  custom: {
    name: (algorithm) => `The pedagog's problem · ${algorithm}`,
    variantName: (algorithm) => `Your variant · ${algorithm}`,
    example: 'An example: in a lab, every student gets their own graph',
    variantOf: 'Variant of',
    mine: 'Yours',
    key: "This variant's expected table (staff only)",
    algorithms: {
      dijkstra: 'Dijkstra',
      bellman: 'Bellman-Ford',
      prim: 'Prim',
      kruskal: 'Kruskal',
      kahn: 'Kahn',
      floyd: 'Floyd-Warshall',
    },
    rules: {
      dijkstra: 'Equal vertices are taken alphabetically.',
      prim: 'On a tie, the first edge alphabetically.',
      kruskal: 'Edges are taken by weight; on a tie, in their listed order.',
      bellman: (edges, passes) =>
        `Edges are relaxed in the order ${edges}; ${passes} passes and one more as the check.`,
      kahn: (order) => `Vertices join the queue in the order ${order}.`,
      floyd: (ks) => `k takes the values ${ks} in turn; fill the whole matrix after each k.`,
    },
  },
  presets: {
    'lab07-dijkstra': { name: 'Lab 7 · Dijkstra from A', rule: 'Equal vertices are taken alphabetically.' },
    'lab07-bellman': {
      name: 'Lab 7 · Bellman-Ford from A',
      rule: 'Edges are relaxed in the order A→B, B→C, B→D, C→D, D→A; 3 passes and a fourth as the check.',
    },
    'lab05-kruskal': {
      name: 'Lab 5 · Kruskal',
      rule: 'Edges are taken by weight; the algorithm stops when the tree has |V| − 1 = 4 edges.',
    },
    'lab05-prim': { name: 'Lab 5 · Prim from A', rule: 'On a tie, the first edge alphabetically.' },
    'lab06-kahn': {
      name: 'Lab 6 · Kahn on the courses',
      rule: 'Vertices join the queue in the order MAT1, MAT2, PRG1, ALG1, PRG2, OS, DB, NET.',
    },
    'lab08-floyd': {
      name: 'Lab 8 · Floyd-Warshall by hand',
      rule: 'k takes the values 0, 1, 2, 3 in turn; fill the whole matrix after each k.',
    },
  },
});

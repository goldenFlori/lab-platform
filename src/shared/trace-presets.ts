import type { TraceProblem } from './trace-problem';

// The course's own trace problems (#150), as data a pedagog's problem also takes (#166): the class
// problems of Labs 5-8, edges in the order the problems list them.

type Edge = [string, string, number?];
const N = (list: [string, number, number][]) => list.map(([id, x, y]) => ({ id, x, y }));
const E = (list: Edge[]) => list.map(([u, v, w]) => ({ u, v, w: w ?? 0 }));

const LAB5_NODES = N([
  ['A', 360, 55],
  ['B', 150, 190],
  ['C', 570, 190],
  ['D', 150, 365],
  ['E', 570, 365],
]);
const LAB5_EDGES = E([
  ['A', 'B', 6],
  ['A', 'C', 1],
  ['B', 'C', 5],
  ['B', 'D', 3],
  ['C', 'D', 4],
  ['C', 'E', 2],
  ['D', 'E', 8],
]);

/** The course DAG of Lab 6's Kahn trace; its vertices join the queue in the order they are listed. */
const COURSE_EDGES: Edge[] = [
  ['MAT1', 'MAT2'],
  ['MAT2', 'ALG1'],
  ['ALG1', 'DB'],
  ['DB', 'NET'],
  ['MAT1', 'PRG1'],
  ['PRG1', 'PRG2'],
  ['PRG2', 'OS'],
  ['OS', 'DB'],
  ['PRG2', 'NET'],
];

export const TRACE_PRESET_IDS = [
  'lab07-dijkstra',
  'lab07-bellman',
  'lab05-kruskal',
  'lab05-prim',
  'lab06-kahn',
  'lab08-floyd',
] as const;
export type TracePresetId = (typeof TRACE_PRESET_IDS)[number];

export const TRACE_PRESETS: Record<TracePresetId, TraceProblem> = {
  'lab07-dijkstra': {
    algorithm: 'dijkstra',
    directed: true,
    nodes: N([
      ['A', 90, 90],
      ['B', 330, 90],
      ['D', 570, 90],
      ['C', 330, 320],
      ['E', 570, 320],
      ['F', 690, 210],
    ]),
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
    source: 'A',
  },
  'lab07-bellman': {
    algorithm: 'bellman',
    directed: true,
    nodes: N([
      ['A', 100, 90],
      ['B', 360, 90],
      ['C', 620, 90],
      ['D', 360, 330],
    ]),
    edges: E([
      ['A', 'B', 1],
      ['B', 'C', -4],
      ['B', 'D', 2],
      ['C', 'D', -1],
      ['D', 'A', 3],
    ]),
    source: 'A',
  },
  'lab05-kruskal': { algorithm: 'kruskal', directed: false, nodes: LAB5_NODES, edges: LAB5_EDGES, source: null },
  'lab05-prim': { algorithm: 'prim', directed: false, nodes: LAB5_NODES, edges: LAB5_EDGES, source: 'A' },
  'lab06-kahn': {
    algorithm: 'kahn',
    directed: true,
    // Laid out by depth, as the course's topological-order game draws it.
    nodes: N([
      ['MAT1', 80, 190],
      ['MAT2', 192, 50],
      ['PRG1', 192, 330],
      ['ALG1', 304, 50],
      ['PRG2', 304, 330],
      ['OS', 416, 190],
      ['DB', 528, 190],
      ['NET', 640, 190],
    ]),
    edges: E(COURSE_EDGES),
    source: null,
  },
  'lab08-floyd': {
    algorithm: 'floyd',
    directed: true,
    nodes: N([
      ['0', 120, 80],
      ['1', 480, 80],
      ['2', 480, 320],
      ['3', 120, 320],
    ]),
    edges: E([
      ['0', '1', 3],
      ['0', '3', 7],
      ['1', '0', 8],
      ['1', '2', 2],
      ['2', '0', 5],
      ['2', '3', 1],
      ['3', '0', 2],
    ]),
    source: null,
  },
};

export const isTracePresetId = (value: unknown): value is TracePresetId =>
  (TRACE_PRESET_IDS as readonly unknown[]).includes(value);

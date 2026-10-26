// A trace problem a pedagog builds (#166): the algorithm, the graph and where it starts, stored as a
// trace table's embed props (`{ "problem": … }`). The API refuses one that breaks these rules, and the
// builder says which rule. No imports: the app, the API and the visualizations all use it.

export const TRACE_ALGORITHMS = ['dijkstra', 'bellman', 'prim', 'kruskal', 'kahn', 'floyd'] as const;
export type TraceAlgorithm = (typeof TRACE_ALGORITHMS)[number];

export type TraceProblem = {
  algorithm: TraceAlgorithm;
  directed: boolean;
  /** In the order Kahn's queue takes them; the other algorithms go alphabetically. */
  nodes: { id: string; x: number; y: number }[];
  edges: { u: string; v: string; w: number }[];
  /** Where Dijkstra, Bellman-Ford and Prim start; null for the others. */
  source: string | null;
};

export const PROBLEM_LIMITS = {
  nodes: 10,
  /** Floyd-Warshall's table is the whole matrix after each k: n² cells per row. */
  floydNodes: 6,
  edges: 30,
  weight: 99,
  width: 720,
  height: 420,
} as const;

/** Whether the algorithm fixes the direction: Prim and Kruskal undirected, Kahn directed. */
export const FIXED_DIRECTION: Partial<Record<TraceAlgorithm, boolean>> = { prim: false, kruskal: false, kahn: true };
export const NEEDS_SOURCE: Record<TraceAlgorithm, boolean> = {
  dijkstra: true,
  bellman: true,
  prim: true,
  kruskal: false,
  kahn: false,
  floyd: false,
};
/** Kahn's graph has no weights. */
export const WEIGHTED: Record<TraceAlgorithm, boolean> = {
  dijkstra: true,
  bellman: true,
  prim: true,
  kruskal: true,
  kahn: false,
  floyd: true,
};

export type ProblemIssue =
  | 'shape'
  | 'nodes'
  | 'ids'
  | 'edges'
  | 'endpoint'
  | 'loop'
  | 'duplicate'
  | 'weight'
  | 'negative'
  | 'direction'
  | 'source';

const ID = /^[A-Za-z0-9]{1,4}$/;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The first rule the problem breaks, or null when it can be traced. Takes anything (API input). */
export function problemIssue(value: unknown): ProblemIssue | null {
  if (!isRecord(value)) return 'shape';
  const { algorithm, directed, nodes, edges, source } = value;
  if (!(TRACE_ALGORITHMS as readonly unknown[]).includes(algorithm) || typeof directed !== 'boolean') return 'shape';
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return 'shape';
  const alg = algorithm as TraceAlgorithm;
  const most = alg === 'floyd' ? PROBLEM_LIMITS.floydNodes : PROBLEM_LIMITS.nodes;
  if (nodes.length < 2 || nodes.length > most) return 'nodes';
  const ids = new Set<string>();
  for (const n of nodes) {
    if (!isRecord(n) || typeof n.id !== 'string' || !ID.test(n.id) || ids.has(n.id)) return 'ids';
    const { x, y } = n;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return 'shape';
    if (x < 0 || y < 0 || x > PROBLEM_LIMITS.width || y > PROBLEM_LIMITS.height) return 'shape';
    ids.add(n.id);
  }
  if (edges.length < 1 || edges.length > PROBLEM_LIMITS.edges) return 'edges';
  const seen = new Set<string>();
  for (const e of edges) {
    if (!isRecord(e) || typeof e.u !== 'string' || typeof e.v !== 'string') return 'shape';
    if (!ids.has(e.u) || !ids.has(e.v)) return 'endpoint';
    if (e.u === e.v) return 'loop';
    const key = directed ? `${e.u}>${e.v}` : [e.u, e.v].sort().join('|');
    if (seen.has(key)) return 'duplicate';
    seen.add(key);
    if (typeof e.w !== 'number' || !Number.isInteger(e.w) || Math.abs(e.w) > PROBLEM_LIMITS.weight) return 'weight';
    if (alg === 'dijkstra' && e.w < 0) return 'negative';
  }
  const fixed = FIXED_DIRECTION[alg];
  if (fixed !== undefined && directed !== fixed) return 'direction';
  if (NEEDS_SOURCE[alg] ? typeof source !== 'string' || !ids.has(source) : source !== null) return 'source';
  return null;
}

export const isTraceProblem = (value: unknown): value is TraceProblem => problemIssue(value) === null;

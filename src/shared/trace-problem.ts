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

/* ------------------------------------------------------------ variants (#167) */

/**
 * A problem asked as a variant per student: the algorithm, the size and the direction; the graph
 * itself is generated from each student's seed, so neighbours do not share answers.
 */
export type TraceVariant = { algorithm: TraceAlgorithm; nodes: number; directed: boolean };

export const VARIANT_SIZES: Record<'other' | 'floyd', [number, number]> = { other: [4, 8], floyd: [3, 5] };

export function variantIssue(value: unknown): 'shape' | 'nodes' | 'direction' | null {
  if (!isRecord(value)) return 'shape';
  const { algorithm, nodes, directed } = value;
  if (!(TRACE_ALGORITHMS as readonly unknown[]).includes(algorithm) || typeof directed !== 'boolean') return 'shape';
  const [least, most] = VARIANT_SIZES[algorithm === 'floyd' ? 'floyd' : 'other'];
  if (typeof nodes !== 'number' || !Number.isInteger(nodes) || nodes < least || nodes > most) return 'nodes';
  const fixed = FIXED_DIRECTION[algorithm as TraceAlgorithm];
  if (fixed !== undefined && directed !== fixed) return 'direction';
  return null;
}

/** The same seed for the same student, notebook and cell, wherever it is computed. */
export const variantSeed = (userId: string, notebookId: string, cell: number) => `${userId}|${notebookId}|${cell}`;

/** A deterministic random number generator from a string (FNV-1a, then mulberry32). */
function randomFrom(seed: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The student's own problem: always connected from A where an algorithm starts there, a DAG for
 * Kahn and for Bellman-Ford with negative weights (so no negative cycle), distinct weights for the
 * spanning trees (no ties to argue about), and about one extra edge for every two vertices, so every
 * variant of the same size is about as hard.
 */
export function variantProblem(spec: TraceVariant, seed: string): TraceProblem {
  const r = randomFrom(`${seed}|${spec.algorithm}|${spec.nodes}|${spec.directed}`);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const shuffle = <T>(list: T[]) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j] as T, a[i] as T];
    }
    return a;
  };
  const n = spec.nodes;
  const ids = 'ABCDEFGH'.slice(0, n).split('');
  const nodes = ids.map((id, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { id, x: Math.round(360 + 250 * Math.cos(angle)), y: Math.round(210 + 160 * Math.sin(angle)) };
  });
  const { algorithm } = spec;
  const directed = FIXED_DIRECTION[algorithm] ?? spec.directed;
  // Kahn and a directed Bellman-Ford go one way along a random order: a DAG, so no cycle at all.
  const acyclic = algorithm === 'kahn' || (algorithm === 'bellman' && directed);
  const order = algorithm === 'kahn' ? shuffle(ids) : ids;
  const pairs = new Set<string>();
  const edges: { u: string; v: string }[] = [];
  const add = (u: string, v: string) => {
    const key = directed ? `${u}>${v}` : [u, v].sort().join('|');
    if (u === v || pairs.has(key)) return false;
    pairs.add(key);
    edges.push({ u, v });
    return true;
  };
  if (algorithm === 'floyd') {
    for (const u of ids) for (const v of ids) if (u !== v && r() < 0.5) add(u, v);
    while (edges.length < n) add(ids[int(0, n - 1)] as string, ids[int(0, n - 1)] as string);
  } else {
    // A spanning tree out of the first vertex, then the extra edges.
    for (let i = 1; i < n; i++) add(order[int(0, i - 1)] as string, order[i] as string);
    for (let tries = 0, extra = Math.ceil(n / 2); extra > 0 && tries < 100; tries++) {
      const [a, b] = [int(0, n - 1), int(0, n - 1)];
      const [i, j] = acyclic ? [Math.min(a, b), Math.max(a, b)] : [a, b];
      if (add(order[i] as string, order[j] as string)) extra--;
    }
  }
  const spanning = algorithm === 'prim' || algorithm === 'kruskal';
  const distinct = shuffle(Array.from({ length: Math.max(edges.length, 9) }, (_, i) => i + 1));
  const weight = (i: number) => {
    if (algorithm === 'kahn') return 0;
    if (spanning) return distinct[i] ?? i + 1;
    if (algorithm === 'bellman' && directed) return int(-3, 9);
    return int(1, 9);
  };
  return {
    algorithm,
    directed,
    nodes,
    edges: edges.map((e, i) => ({ ...e, w: weight(i) })),
    source: NEEDS_SOURCE[algorithm] ? 'A' : null,
  };
}

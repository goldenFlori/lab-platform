import type { GEdge, GNode } from '../kit/GraphCanvas';
import type { TraversalStep } from './graphs';
import { INF, type PathStep } from './shortest';

// "Your code, visualized" on graphs (#70): the graph a student's code registered with vizlab, laid
// out on a circle, and what their traversal did as frames for the course's graph canvas. The
// reference algorithms' steps become the same frames, so both sides draw alike.

export type VizlabGraphEvent =
  | { op: 'graph'; nodes: string[]; edges: [string, string, number | null][]; directed: boolean }
  | { op: 'visit'; node: string }
  | { op: 'relax'; u: string; v: string; dist: number }
  | { op: 'mark'; u: string; v: string; state: 'tree' | 'seen' };

export type VizlabGraphRun = { kind: 'graph'; events: VizlabGraphEvent[]; truncated: boolean };

/** One moment of a traversal, as both sides draw it. */
export type GraphFrame = {
  note: string;
  current: string | null;
  /** Visited (or settled) vertices, in order. */
  order: string[];
  tree: number[];
  considering: number | null;
  dist: Record<string, number> | null;
};

export type VizlabGraphText = {
  start: (node: string) => string;
  visit: (node: string, n: number) => string;
  relax: (u: string, v: string, d: number) => string;
  tree: (u: string, v: string) => string;
  seen: (u: string, v: string) => string;
  done: (order: string) => string;
  noVisits: string;
  truncated: string;
};

export type DrawnGraph = { nodes: GNode[]; edges: GEdge[]; directed: boolean; weighted: boolean };

/** The registered graph, its vertices on a circle (a canvas of 640 × 420). */
export function drawnGraph(run: VizlabGraphRun): DrawnGraph | null {
  const first = run.events[0];
  if (first?.op !== 'graph') return null;
  const n = first.nodes.length;
  const nodes = first.nodes.map((id, i) => {
    const angle = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
    return { id, x: 320 + 170 * Math.cos(angle), y: 210 + 150 * Math.sin(angle) };
  });
  const edges = first.edges.map(([u, v, w]) => (w === null ? { u, v } : { u, v, w }));
  return { nodes, edges, directed: first.directed, weighted: first.edges.some(([, , w]) => w !== null) };
}

/** The drawn edge u→v (either way when undirected), or null. */
function edgeIndex(graph: DrawnGraph, u: string, v: string) {
  const i = graph.edges.findIndex((e) => (e.u === u && e.v === v) || (!graph.directed && e.u === v && e.v === u));
  return i >= 0 ? i : null;
}

export function vizlabGraphFrames(run: VizlabGraphRun, graph: DrawnGraph, text: VizlabGraphText): GraphFrame[] {
  const frames: GraphFrame[] = [];
  const order: string[] = [];
  const tree: number[] = [];
  let dist: Record<string, number> | null = null;
  let current: string | null = null;
  const push = (note: string, considering: number | null = null) =>
    frames.push({ note, current, order: [...order], tree: [...tree], considering, dist: dist && { ...dist } });
  for (const e of run.events) {
    if (e.op === 'graph') push(text.start(graph.nodes[0]?.id ?? ''));
    if (e.op === 'visit') {
      current = e.node;
      if (!order.includes(e.node)) order.push(e.node);
      push(text.visit(e.node, order.length));
    }
    if (e.op === 'relax') {
      dist = { ...(dist ?? {}), [e.v]: e.dist };
      push(text.relax(e.u, e.v, e.dist), edgeIndex(graph, e.u, e.v));
    }
    if (e.op === 'mark') {
      const i = edgeIndex(graph, e.u, e.v);
      if (e.state === 'tree' && i !== null && !tree.includes(i)) tree.push(i);
      push(e.state === 'tree' ? text.tree(e.u, e.v) : text.seen(e.u, e.v), e.state === 'seen' ? i : null);
    }
  }
  const last = frames.at(-1);
  if (last) {
    frames.push({
      ...last,
      current: null,
      considering: null,
      note: run.truncated ? text.truncated : order.length ? text.done(order.join(' → ')) : text.noVisits,
    });
  }
  return frames;
}

export const fromTraversal = (s: TraversalStep): GraphFrame => ({
  note: s.note,
  current: s.current,
  order: s.order,
  tree: s.tree,
  considering: s.considering,
  dist: null,
});

/** Dijkstra's step: the settled vertices in order, the shortest-path tree so far, the distances. */
export function fromPath(s: PathStep, graph: DrawnGraph): GraphFrame {
  const tree: number[] = [];
  for (const [v, u] of Object.entries(s.prev)) {
    const i = u === null ? null : edgeIndex(graph, u, v);
    if (i !== null) tree.push(i);
  }
  const dist = Object.fromEntries(Object.entries(s.dist).filter(([, d]) => d !== INF));
  return { note: s.note, current: s.current, order: s.settled, tree, considering: s.relaxing, dist };
}

/* =====================================================================
 *  Shortest paths — Dijkstra, Bellman-Ford, Floyd-Warshall (Laboratori 7–8)
 * ===================================================================== */

import type { GEdge, GNode } from '../kit/GraphCanvas';
import { SHORTEST_TEXT, type ShortestText } from './shortest.text';

export const INF = Infinity;
export const inf = (v: number) => (v === INF ? '∞' : String(v));

/** A directed arc that remembers which drawn edge it came from. */
export interface Arc {
  u: string;
  v: string;
  w: number;
  ei: number;
}

export function toArcs(edges: GEdge[], directed: boolean): Arc[] {
  const arcs: Arc[] = [];
  edges.forEach((e, ei) => {
    arcs.push({ u: e.u, v: e.v, w: e.w ?? 0, ei });
    if (!directed && e.u !== e.v) arcs.push({ u: e.v, v: e.u, w: e.w ?? 0, ei });
  });
  return arcs;
}

export interface PathStep {
  note: string;
  dist: Record<string, number>;
  prev: Record<string, string | null>;
  current: string | null;
  settled: string[];
  /** index of the drawn edge being relaxed */
  relaxing: number | null;
  updated: string[];
  /** the arc Bellman-Ford relaxes at this step */
  arc?: { u: string; v: string; w: number };
  iteration?: number;
  relaxations: number;
  negativeCycle?: boolean;
  done?: boolean;
}

export function dijkstraSteps(
  nodes: GNode[],
  arcs: Arc[],
  src: string,
  text: ShortestText = SHORTEST_TEXT.sq,
): PathStep[] {
  const T = text.dijkstra;
  const steps: PathStep[] = [];
  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  for (const n of nodes) {
    dist[n.id] = INF;
    prev[n.id] = null;
  }
  dist[src] = 0;
  const settled: string[] = [];
  let relax = 0;
  const negative = arcs.some((a) => a.w < 0);
  steps.push({
    note: negative ? T.startNegative(src) : T.start(src),
    dist: { ...dist },
    prev: { ...prev },
    current: null,
    settled: [],
    relaxing: null,
    updated: [],
    relaxations: 0,
  });
  while (settled.length < nodes.length) {
    let u: string | null = null;
    for (const n of nodes) {
      if (settled.includes(n.id)) continue;
      if (u === null || dist[n.id] < dist[u]) u = n.id;
    }
    if (u === null || dist[u] === INF) {
      steps.push({
        note: T.unreachable,
        dist: { ...dist },
        prev: { ...prev },
        current: null,
        settled: [...settled],
        relaxing: null,
        updated: [],
        relaxations: relax,
        done: true,
      });
      return steps;
    }
    settled.push(u);
    steps.push({
      note: T.pick(u, inf(dist[u])),
      dist: { ...dist },
      prev: { ...prev },
      current: u,
      settled: [...settled],
      relaxing: null,
      updated: [],
      relaxations: relax,
    });
    for (const a of arcs.filter((x) => x.u === u)) {
      if (settled.includes(a.v) && !negative) continue;
      relax++;
      const old = dist[a.v];
      const cand = dist[u] + a.w;
      const better = cand < old;
      if (better) {
        dist[a.v] = cand;
        prev[a.v] = u;
      }
      steps.push({
        note: T.relax(a.u, a.v, a.w, inf(dist[u]), inf(cand), better, inf(old), cand),
        dist: { ...dist },
        prev: { ...prev },
        current: u,
        settled: [...settled],
        relaxing: a.ei,
        updated: better ? [a.v] : [],
        relaxations: relax,
      });
    }
  }
  steps.push({
    note: negative ? T.doneNegative : T.done(relax),
    dist: { ...dist },
    prev: { ...prev },
    current: null,
    settled: [...settled],
    relaxing: null,
    updated: [],
    relaxations: relax,
    done: true,
  });
  return steps;
}

export function bellmanFordSteps(
  nodes: GNode[],
  arcs: Arc[],
  src: string,
  text: ShortestText = SHORTEST_TEXT.sq,
): PathStep[] {
  const T = text.bellman;
  const steps: PathStep[] = [];
  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  for (const n of nodes) {
    dist[n.id] = INF;
    prev[n.id] = null;
  }
  dist[src] = 0;
  let relax = 0;
  steps.push({
    note: T.start(src, nodes.length - 1),
    dist: { ...dist },
    prev: { ...prev },
    current: null,
    settled: [],
    relaxing: null,
    updated: [],
    iteration: 0,
    relaxations: 0,
  });
  for (let it = 1; it <= nodes.length - 1; it++) {
    let changed = false;
    for (const a of arcs) {
      if (dist[a.u] === INF) continue;
      relax++;
      const old = dist[a.v];
      const cand = dist[a.u] + a.w;
      const better = cand < old;
      if (better) {
        dist[a.v] = cand;
        prev[a.v] = a.u;
        changed = true;
      }
      steps.push({
        note: T.relax(it, a.u, a.v, a.w, inf(dist[a.u]), inf(cand), better, inf(old), cand),
        dist: { ...dist },
        prev: { ...prev },
        current: a.u,
        settled: [],
        relaxing: a.ei,
        updated: better ? [a.v] : [],
        arc: { u: a.u, v: a.v, w: a.w },
        iteration: it,
        relaxations: relax,
      });
    }
    if (!changed) {
      steps.push({
        note: T.early(it, nodes.length - 1),
        dist: { ...dist },
        prev: { ...prev },
        current: null,
        settled: [],
        relaxing: null,
        updated: [],
        iteration: it,
        relaxations: relax,
      });
      break;
    }
  }
  let negCycle = false;
  for (const a of arcs) if (dist[a.u] !== INF && dist[a.u] + a.w < dist[a.v]) negCycle = true;
  steps.push({
    note: negCycle ? T.negativeCycle(nodes.length - 1) : T.done(relax),
    dist: { ...dist },
    prev: { ...prev },
    current: null,
    settled: [],
    relaxing: null,
    updated: [],
    relaxations: relax,
    negativeCycle: negCycle,
    done: true,
  });
  return steps;
}

/** dist after each full Bellman-Ford iteration (for the quiz). */
export function bfSnapshots(nodes: GNode[], arcs: Arc[], src: string) {
  const dist: Record<string, number> = Object.fromEntries(nodes.map((n) => [n.id, INF]));
  dist[src] = 0;
  const snaps = [{ ...dist }];
  for (let it = 1; it <= nodes.length - 1; it++) {
    for (const a of arcs) if (dist[a.u] !== INF && dist[a.u] + a.w < dist[a.v]) dist[a.v] = dist[a.u] + a.w;
    snaps.push({ ...dist });
  }
  return snaps;
}

export function pathTo(prev: Record<string, string | null>, src: string, dst: string): string[] | null {
  const p = [dst];
  let guard = 0;
  while (p[p.length - 1] !== src) {
    const x = prev[p[p.length - 1]];
    if (x == null || guard++ > 64) return null;
    p.push(x);
  }
  return p.reverse();
}

/* ------------------------------------------------------------ Floyd */

export interface FwStep {
  note: string;
  D: number[][];
  P: (number | null)[][];
  k: number;
  i: number;
  j: number;
  improved: boolean;
  phase: 'init' | 'k' | 'cmp' | 'done';
  updates: number;
  negativeCycle?: boolean;
}

export function floydSteps(W: number[][], L: string[], text: ShortestText = SHORTEST_TEXT.sq): FwStep[] {
  const T = text.floyd;
  const n = W.length;
  const D = W.map((r) => r.slice());
  const P: (number | null)[][] = W.map((row, i) => row.map((v, j) => (i !== j && v !== INF ? i : null)));
  const steps: FwStep[] = [];
  let updates = 0;
  const snap = () => ({ D: D.map((r) => r.slice()), P: P.map((r) => r.slice()) });
  steps.push({
    note: T.start,
    ...snap(),
    k: -1,
    i: -1,
    j: -1,
    improved: false,
    phase: 'init',
    updates,
  });
  for (let k = 0; k < n; k++) {
    steps.push({
      note: T.k(L[k]),
      ...snap(),
      k,
      i: -1,
      j: -1,
      improved: false,
      phase: 'k',
      updates,
    });
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j || i === k || j === k) continue;
        const old = D[i][j];
        const through = D[i][k] === INF || D[k][j] === INF ? INF : D[i][k] + D[k][j];
        const improved = through < old;
        if (improved) {
          D[i][j] = through;
          P[i][j] = P[k][j];
          updates++;
        }
        steps.push({
          note: T.compare(L[i], L[j], L[k], inf(old), inf(D[i][k]), inf(D[k][j]), inf(through), improved),
          ...snap(),
          k,
          i,
          j,
          improved,
          phase: 'cmp',
          updates,
        });
      }
    }
  }
  const neg = D.some((row, i) => row[i] < 0);
  steps.push({
    note: neg ? T.negativeCycle : T.done(n, n ** 3, updates),
    ...snap(),
    k: n - 1,
    i: -1,
    j: -1,
    improved: false,
    phase: 'done',
    updates,
    negativeCycle: neg,
  });
  return steps;
}

export function fwPath(P: (number | null)[][], s: number, t: number): number[] | null {
  if (s === t) return [s];
  if (P[s][t] === null) return null;
  const path = [t];
  let guard = 0;
  while (path[path.length - 1] !== s && guard++ < 64) {
    const p = P[s][path[path.length - 1]];
    if (p === null) return null;
    path.push(p);
  }
  return path.reverse();
}

export function weightMatrix(ids: string[], edges: GEdge[], directed: boolean) {
  const idx = new Map(ids.map((id, i) => [id, i]));
  const W = ids.map((_, i) => ids.map((__, j) => (i === j ? 0 : INF)));
  for (const e of edges) {
    const a = idx.get(e.u),
      b = idx.get(e.v);
    if (a === undefined || b === undefined) continue;
    W[a][b] = Math.min(W[a][b], e.w ?? 0);
    if (!directed) W[b][a] = Math.min(W[b][a], e.w ?? 0);
  }
  return W;
}

/* =====================================================================
 *  Maximum flow / minimum cut — Leksionet 5–6, Laboratorët 8–9
 *
 *  Follows the lecture's definitions: f ≥ 0 on the edges of E, and the
 *  residual network G_f has a forward arc (u,v) with c − f and a backward
 *  arc (v,u) with f (slide 37).
 * ===================================================================== */

import type { GEdge, GNode } from '../kit/GraphCanvas';
import { MAXFLOW_TEXT, type MaxflowText } from './maxflow.text';

export type Strategy = 'ek' | 'ff' | 'greedy' | 'adversary';

export interface RArc {
  u: string;
  v: string;
  cap: number;
  /** index of the network edge this residual arc belongs to */
  ei: number;
  back: boolean;
}

export function residual(edges: GEdge[], f: number[]): RArc[] {
  const out: RArc[] = [];
  edges.forEach((e, ei) => {
    const c = e.w ?? 0;
    if (c - f[ei] > 0) out.push({ u: e.u, v: e.v, cap: c - f[ei], ei, back: false });
    if (f[ei] > 0) out.push({ u: e.v, v: e.u, cap: f[ei], ei, back: true });
  });
  return out;
}

function adjacency(arcs: RArc[]) {
  const adj = new Map<string, RArc[]>();
  for (const a of arcs) {
    const out = adj.get(a.u);
    if (out) out.push(a);
    else adj.set(a.u, [a]);
  }
  return adj;
}

function bfsPath(arcs: RArc[], s: string, t: string): RArc[] | null {
  const adj = adjacency(arcs);
  const via = new Map<string, RArc | null>([[s, null]]);
  const q = [s];
  for (let u = q.shift(); u !== undefined; u = q.shift()) {
    if (u === t) break;
    for (const a of adj.get(u) ?? []) {
      if (via.has(a.v)) continue;
      via.set(a.v, a);
      q.push(a.v);
    }
  }
  if (!via.has(t)) return null;
  const path: RArc[] = [];
  for (let a = via.get(t); a; a = via.get(a.u)) path.push(a);
  return path.reverse();
}

function dfsPath(arcs: RArc[], s: string, t: string): RArc[] | null {
  const adj = adjacency(arcs);
  const seen = new Set([s]);
  const path: RArc[] = [];
  const go = (u: string): boolean => {
    if (u === t) return true;
    for (const a of adj.get(u) ?? []) {
      if (seen.has(a.v)) continue;
      seen.add(a.v);
      path.push(a);
      if (go(a.v)) return true;
      path.pop();
    }
    return false;
  };
  return go(s) ? path : null;
}

/** The "opponent" of slide 66: among all simple paths, picks the one with the smallest bottleneck. */
function worstPath(arcs: RArc[], s: string, t: string): RArc[] | null {
  const adj = adjacency(arcs);
  let best: RArc[] | null = null;
  let bestX = Infinity;
  let budget = 20000;
  const path: RArc[] = [];
  const seen = new Set([s]);
  const go = (u: string, x: number) => {
    if (budget-- <= 0) return;
    if (u === t) {
      if (x < bestX || (x === bestX && best && path.length > best.length)) {
        bestX = x;
        best = [...path];
      }
      return;
    }
    for (const a of adj.get(u) ?? []) {
      if (seen.has(a.v)) continue;
      seen.add(a.v);
      path.push(a);
      go(a.v, Math.min(x, a.cap));
      path.pop();
      seen.delete(a.v);
    }
  };
  go(s, Infinity);
  return best;
}

export interface FlowStep {
  phase: 'init' | 'path' | 'augment' | 'stuck' | 'done';
  note: string;
  flow: number[];
  value: number;
  path: RArc[];
  x: number;
  bottleneck: number | null;
  iteration: number;
  history: { path: string; x: number }[];
  /** source side of the cut certified by the final residual graph */
  cutS?: string[];
}

const label = (p: RArc[], s: string) => [s, ...p.map((a) => a.v)].join(' → ');

export function maxflowSteps(
  _nodes: GNode[],
  edges: GEdge[],
  s: string,
  t: string,
  strategy: Strategy,
  maxAug = 400,
  initial?: number[],
  describe?: (path: RArc[], x: number) => string,
  T: MaxflowText = MAXFLOW_TEXT.sq,
): FlowStep[] {
  const f = initial ? [...initial] : edges.map(() => 0);
  const steps: FlowStep[] = [];
  const history: { path: string; x: number }[] = [];
  let value = edges.reduce((sum, e, i) => sum + (e.u === s ? f[i] : 0) - (e.v === s ? f[i] : 0), 0);
  const name =
    strategy === 'ek'
      ? 'Edmonds-Karp (BFS)'
      : strategy === 'ff'
        ? 'Ford-Fulkerson (DFS)'
        : strategy === 'greedy'
          ? T.greedyName
          : T.adversaryName;
  steps.push({
    phase: 'init',
    note: strategy === 'greedy' ? T.greedyStart : initial ? T.fromGiven(name, value) : T.start(name),
    flow: [...f],
    value,
    path: [],
    x: 0,
    bottleneck: null,
    iteration: 0,
    history: [],
  });

  for (let it = 1; it <= maxAug; it++) {
    let arcs = residual(edges, f);
    if (strategy === 'greedy') arcs = arcs.filter((a) => !a.back);
    const path =
      strategy === 'ek' ? bfsPath(arcs, s, t) : strategy === 'adversary' ? worstPath(arcs, s, t) : dfsPath(arcs, s, t);
    if (!path) break;
    const x = Math.min(...path.map((a) => a.cap));
    const bi = path.findIndex((a) => a.cap === x);
    const hasBack = path.some((a) => a.back);
    steps.push({
      phase: 'path',
      note: describe ? describe(path, x) : T.path(it, label(path, s), hasBack, path.map((a) => a.cap).join(', '), x),
      flow: [...f],
      value,
      path,
      x,
      bottleneck: bi,
      iteration: it,
      history: [...history],
    });
    for (const a of path) f[a.ei] += a.back ? -x : x;
    value += x;
    history.push({ path: label(path, s), x });
    steps.push({
      phase: 'augment',
      note: hasBack ? T.augmentBack(x, value) : T.augment(x, value),
      flow: [...f],
      value,
      path,
      x,
      bottleneck: bi,
      iteration: it,
      history: [...history],
    });
  }

  // certificate: vertices reachable from s in the final residual network
  const arcs = residual(edges, f);
  const adj = adjacency(arcs);
  const S = new Set([s]);
  const q = [s];
  for (let u = q.shift(); u !== undefined; u = q.shift()) {
    for (const a of adj.get(u) ?? []) {
      if (S.has(a.v)) continue;
      S.add(a.v);
      q.push(a.v);
    }
  }
  const cutS = [...S];
  const cutCap = edges.reduce((sum, e) => sum + (S.has(e.u) && !S.has(e.v) ? (e.w ?? 0) : 0), 0);
  if (strategy === 'greedy' && S.has(t)) {
    steps.push({
      phase: 'stuck',
      note: T.stuck(value),
      flow: [...f],
      value,
      path: [],
      x: 0,
      bottleneck: null,
      iteration: history.length,
      history: [...history],
    });
    return steps;
  }
  steps.push({
    phase: 'done',
    note: T.done(cutS.join(', '), cutCap, value, history.length),
    flow: [...f],
    value,
    path: [],
    x: 0,
    bottleneck: null,
    iteration: history.length,
    history: [...history],
    cutS,
  });
  return steps;
}

export function maxflowValue(edges: GEdge[], s: string, t: string) {
  const steps = maxflowSteps([], edges, s, t, 'ek');
  return steps[steps.length - 1];
}

/** Is t still reachable from s once the given edges are removed? */
export function separated(edges: GEdge[], removed: Set<number>, s: string, t: string) {
  const adj = new Map<string, string[]>();
  edges.forEach((e, i) => {
    if (removed.has(i)) return;
    const out = adj.get(e.u);
    if (out) out.push(e.v);
    else adj.set(e.u, [e.v]);
  });
  const seen = new Set([s]);
  const q = [s];
  for (let u = q.shift(); u !== undefined; u = q.shift()) {
    for (const v of adj.get(u) ?? []) {
      if (seen.has(v)) continue;
      seen.add(v);
      q.push(v);
    }
  }
  return { separated: !seen.has(t), reach: seen };
}

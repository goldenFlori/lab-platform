/* =====================================================================
 *  Graph algorithms for the visualizers: properties, traversals, MST,
 *  independent sets, cliques, bipartiteness.
 *  Edges are referred to by their index, so parallel edges stay distinct.
 * ===================================================================== */

import type { GEdge, GNode } from '../kit/GraphCanvas';
import { must } from '../kit/must';
import { GRAPHS_TEXT, type GraphsText } from './graphs.text';

export interface TraversalStep {
  note: string;
  current: string | null;
  visited: string[];
  frontier: string[];
  order: string[];
  tree: number[];
  considering: number | null;
  level?: Record<string, number>;
  line?: number;
}

export interface MstStep {
  note: string;
  tree: number[];
  rejected: number[];
  considering: number | null;
  inTree: string[];
  weight: number;
  line?: number;
}

/** Natural order ("2" < "10", "A" < "B") — identical on the server and in the browser. */
export function natural(a: string, b: string) {
  const na = Number(a),
    nb = Number(b);
  if (a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Neighbours, following direction when the graph is directed. Deduplicated, sorted. */
export function neighbours(nodes: GNode[], edges: GEdge[], directed: boolean) {
  const adj = new Map<string, { to: string; edge: number }[]>(nodes.map((n) => [n.id, []]));
  edges.forEach((e, i) => {
    if (e.u === e.v) return;
    adj.get(e.u)?.push({ to: e.v, edge: i });
    if (!directed) adj.get(e.v)?.push({ to: e.u, edge: i });
  });
  for (const [k, list] of adj) {
    const seen = new Set<string>();
    adj.set(
      k,
      list
        .sort((a, b) => natural(a.to, b.to))
        .filter((x) => {
          if (seen.has(x.to)) return false;
          seen.add(x.to);
          return true;
        }),
    );
  }
  return adj;
}

/* ------------------------------------------------------------ BFS / DFS */

export function bfsSteps(
  nodes: GNode[],
  edges: GEdge[],
  directed: boolean,
  start: string,
  text: GraphsText = GRAPHS_TEXT.sq,
): TraversalStep[] {
  const T = text.bfs;
  const adj = neighbours(nodes, edges, directed);
  const steps: TraversalStep[] = [];
  const visited = [start];
  const queue = [start];
  const order: string[] = [];
  const tree: number[] = [];
  const level: Record<string, number> = { [start]: 0 };
  steps.push({
    note: T.start(start),
    current: start,
    visited: [...visited],
    frontier: [...queue],
    order: [],
    tree: [],
    considering: null,
    level: { ...level },
    line: 0,
  });
  for (let v = queue.shift(); v !== undefined; v = queue.shift()) {
    order.push(v);
    steps.push({
      note: T.dequeue(v, level[v]),
      current: v,
      visited: [...visited],
      frontier: [...queue],
      order: [...order],
      tree: [...tree],
      considering: null,
      level: { ...level },
      line: 2,
    });
    for (const { to: w, edge } of adj.get(v) ?? []) {
      if (visited.includes(w)) {
        steps.push({
          note: T.seen(w),
          current: v,
          visited: [...visited],
          frontier: [...queue],
          order: [...order],
          tree: [...tree],
          considering: edge,
          level: { ...level },
          line: 3,
        });
        continue;
      }
      visited.push(w);
      queue.push(w);
      tree.push(edge);
      level[w] = level[v] + 1;
      steps.push({
        note: T.enqueue(w, level[w]),
        current: v,
        visited: [...visited],
        frontier: [...queue],
        order: [...order],
        tree: [...tree],
        considering: edge,
        level: { ...level },
        line: 4,
      });
    }
  }
  const missing = nodes.length - visited.length;
  steps.push({
    note: T.done(order.join(' → '), missing, start),
    current: null,
    visited: [...visited],
    frontier: [],
    order: [...order],
    tree: [...tree],
    considering: null,
    level: { ...level },
  });
  return steps;
}

export function dfsSteps(
  nodes: GNode[],
  edges: GEdge[],
  directed: boolean,
  start: string,
  text: GraphsText = GRAPHS_TEXT.sq,
): TraversalStep[] {
  const T = text.dfs;
  const adj = neighbours(nodes, edges, directed);
  const steps: TraversalStep[] = [];
  const visited: string[] = [];
  const stack: { v: string; via: number | null }[] = [{ v: start, via: null }];
  const order: string[] = [];
  const tree: number[] = [];
  steps.push({
    note: T.start(start),
    current: start,
    visited: [],
    frontier: [start],
    order: [],
    tree: [],
    considering: null,
    line: 0,
  });
  for (let top = stack.pop(); top !== undefined; top = stack.pop()) {
    const { v, via } = top;
    if (visited.includes(v)) {
      steps.push({
        note: T.stale(v),
        current: v,
        visited: [...visited],
        frontier: stack.map((s) => s.v),
        order: [...order],
        tree: [...tree],
        considering: via,
        line: 2,
      });
      continue;
    }
    visited.push(v);
    order.push(v);
    if (via !== null) tree.push(via);
    steps.push({
      note: T.pop(v),
      current: v,
      visited: [...visited],
      frontier: stack.map((s) => s.v),
      order: [...order],
      tree: [...tree],
      considering: via,
      line: 2,
    });
    const next = (adj.get(v) ?? []).filter((x) => !visited.includes(x.to)).reverse();
    for (const x of next) stack.push({ v: x.to, via: x.edge });
    if (next.length)
      steps.push({
        note: T.push(
          v,
          next
            .map((x) => x.to)
            .reverse()
            .join(', '),
          next[next.length - 1].to,
        ),
        current: v,
        visited: [...visited],
        frontier: stack.map((s) => s.v),
        order: [...order],
        tree: [...tree],
        considering: null,
        line: 3,
      });
  }
  const missing = nodes.length - visited.length;
  steps.push({
    note: T.done(order.join(' → '), missing, start),
    current: null,
    visited: [...visited],
    frontier: [],
    order: [...order],
    tree: [...tree],
    considering: null,
  });
  return steps;
}

/* ----------------------------------------------------------- Kruskal/Prim */

export function kruskalSteps(nodes: GNode[], edges: GEdge[], text: GraphsText = GRAPHS_TEXT.sq): MstStep[] {
  const T = text.kruskal;
  const steps: MstStep[] = [];
  const idx = edges
    .map((_, i) => i)
    .filter((i) => edges[i].u !== edges[i].v)
    .sort((a, b) => (edges[a].w ?? 0) - (edges[b].w ?? 0));
  const parent = new Map(nodes.map((n) => [n.id, n.id]));
  const up = (x: string) => parent.get(x) ?? x;
  const find = (x: string): string => {
    while (up(x) !== x) {
      parent.set(x, up(up(x)));
      x = up(x);
    }
    return x;
  };
  const tree: number[] = [];
  const rejected: number[] = [];
  let total = 0;
  const lbl = (i: number) => `${edges[i].u}–${edges[i].v}(${edges[i].w ?? 0})`;
  steps.push({
    note: T.start(idx.map(lbl).join(', ')),
    tree: [],
    rejected: [],
    considering: null,
    inTree: [],
    weight: 0,
    line: 0,
  });
  for (const i of idx) {
    const e = edges[i];
    const ru = find(e.u),
      rv = find(e.v);
    steps.push({
      note: T.consider(lbl(i), e.u, ru, e.v, rv),
      tree: [...tree],
      rejected: [...rejected],
      considering: i,
      inTree: [],
      weight: total,
      line: 1,
    });
    if (ru !== rv) {
      parent.set(ru, rv);
      tree.push(i);
      total += e.w ?? 0;
      steps.push({
        note: T.accept(tree.length, total),
        tree: [...tree],
        rejected: [...rejected],
        considering: i,
        inTree: [],
        weight: total,
        line: 2,
      });
      if (tree.length === nodes.length - 1) break;
    } else {
      rejected.push(i);
      steps.push({
        note: T.reject,
        tree: [...tree],
        rejected: [...rejected],
        considering: i,
        inTree: [],
        weight: total,
        line: 3,
      });
    }
  }
  const ok = tree.length === nodes.length - 1;
  steps.push({
    note: ok ? T.done(tree.length, total) : T.forest(tree.length),
    tree: [...tree],
    rejected: [...rejected],
    considering: null,
    inTree: [],
    weight: total,
  });
  return steps;
}

export function primSteps(nodes: GNode[], edges: GEdge[], start: string, text: GraphsText = GRAPHS_TEXT.sq): MstStep[] {
  const T = text.prim;
  const steps: MstStep[] = [];
  const inTree = new Set([start]);
  const tree: number[] = [];
  let total = 0;
  const lbl = (i: number) => `${edges[i].u}–${edges[i].v}(${edges[i].w ?? 0})`;
  steps.push({
    note: T.start(start),
    tree: [],
    rejected: [],
    considering: null,
    inTree: [start],
    weight: 0,
    line: 0,
  });
  while (inTree.size < nodes.length) {
    const cand = edges
      .map((_, i) => i)
      .filter((i) => edges[i].u !== edges[i].v && inTree.has(edges[i].u) !== inTree.has(edges[i].v));
    if (!cand.length) {
      steps.push({
        note: T.stuck,
        tree: [...tree],
        rejected: [],
        considering: null,
        inTree: [...inTree],
        weight: total,
      });
      break;
    }
    const best = cand.reduce((a, b) => ((edges[b].w ?? 0) < (edges[a].w ?? 0) ? b : a));
    steps.push({
      note: T.candidates(cand.map(lbl).join(', '), lbl(best)),
      tree: [...tree],
      rejected: [],
      considering: best,
      inTree: [...inTree],
      weight: total,
      line: 1,
    });
    const e = edges[best];
    const added = inTree.has(e.u) ? e.v : e.u;
    inTree.add(added);
    tree.push(best);
    total += e.w ?? 0;
    steps.push({
      note: T.add(added, lbl(best), total),
      tree: [...tree],
      rejected: [],
      considering: best,
      inTree: [...inTree],
      weight: total,
      line: 2,
    });
  }
  steps.push({
    note: T.done(total),
    tree: [...tree],
    rejected: [],
    considering: null,
    inTree: [...inTree],
    weight: total,
  });
  return steps;
}

/* ------------------------------------------------------------ properties */

export interface Props {
  order: number;
  size: number;
  loops: number;
  parallel: number;
  degree: Record<string, number>;
  inDeg: Record<string, number>;
  outDeg: Record<string, number>;
  degreeSum: number;
  components: string[][];
  odd: string[];
  regular: number | null;
  complete: boolean;
}

export function properties(nodes: GNode[], edges: GEdge[], directed: boolean): Props {
  const degree: Record<string, number> = {},
    inDeg: Record<string, number> = {},
    outDeg: Record<string, number> = {};
  for (const n of nodes) degree[n.id] = inDeg[n.id] = outDeg[n.id] = 0;
  let loops = 0;
  const pairCount = new Map<string, number>();
  for (const e of edges) {
    if (!(e.u in degree) || !(e.v in degree)) continue;
    degree[e.u]++;
    degree[e.v]++;
    outDeg[e.u]++;
    inDeg[e.v]++;
    if (e.u === e.v) loops++;
    const k = directed ? `${e.u}>${e.v}` : e.u < e.v ? `${e.u}|${e.v}` : `${e.v}|${e.u}`;
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
  }
  let parallel = 0;
  for (const c of pairCount.values()) if (c > 1) parallel += c - 1;

  // connected components of the underlying undirected graph
  const und = neighbours(nodes, edges, false);
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    const comp: string[] = [];
    const q = [n.id];
    seen.add(n.id);
    for (let v = q.shift(); v !== undefined; v = q.shift()) {
      comp.push(v);
      for (const { to } of und.get(v) ?? []) {
        if (seen.has(to)) continue;
        seen.add(to);
        q.push(to);
      }
    }
    components.push(comp);
  }
  const degs = Object.values(degree);
  const regular = degs.length && degs.every((d) => d === degs[0]) ? degs[0] : null;
  const simple = loops === 0 && parallel === 0;
  const complete =
    !directed && simple && nodes.length > 1 && pairCount.size === (nodes.length * (nodes.length - 1)) / 2;
  return {
    order: nodes.length,
    size: edges.length,
    loops,
    parallel,
    degree,
    inDeg,
    outDeg,
    degreeSum: degs.reduce((a, b) => a + b, 0),
    components,
    odd: nodes.filter((n) => degree[n.id] % 2 === 1).map((n) => n.id),
    regular,
    complete,
  };
}

/* --------------------------------------------- independent set / clique */

const adjacentSet = (edges: GEdge[]) => {
  const s = new Set<string>();
  for (const e of edges) {
    if (e.u === e.v) continue;
    s.add(`${e.u}|${e.v}`);
    s.add(`${e.v}|${e.u}`);
  }
  return s;
};

export function isIndependent(edges: GEdge[], set: string[]) {
  const adj = adjacentSet(edges);
  for (let i = 0; i < set.length; i++)
    for (let j = i + 1; j < set.length; j++) if (adj.has(`${set[i]}|${set[j]}`)) return false;
  return true;
}

export function isClique(edges: GEdge[], set: string[]) {
  const adj = adjacentSet(edges);
  for (let i = 0; i < set.length; i++)
    for (let j = i + 1; j < set.length; j++) if (!adj.has(`${set[i]}|${set[j]}`)) return false;
  return true;
}

/** Brute force — fine for the small graphs drawn in class (≤ 16 vertices). */
export function largest(nodes: GNode[], edges: GEdge[], kind: 'clique' | 'independent'): string[] {
  const ids = nodes.map((n) => n.id);
  if (ids.length > 16) return [];
  let best: string[] = [];
  for (let mask = 1; mask < 1 << ids.length; mask++) {
    const set = ids.filter((_, i) => mask & (1 << i));
    if (set.length <= best.length) continue;
    if (kind === 'clique' ? isClique(edges, set) : isIndependent(edges, set)) best = set;
  }
  return best;
}

/** Two-colouring by BFS. If impossible, returns an odd cycle as the reason. */
export function bipartite(
  nodes: GNode[],
  edges: GEdge[],
): { ok: true; side: Record<string, 0 | 1> } | { ok: false; cycle: string[]; side: Record<string, 0 | 1> } {
  const und = neighbours(nodes, edges, false);
  const side: Record<string, 0 | 1> = {};
  const parent: Record<string, string | null> = {};
  for (const e of edges) if (e.u === e.v) return { ok: false, cycle: [e.u], side };
  for (const n of nodes) {
    if (n.id in side) continue;
    side[n.id] = 0;
    parent[n.id] = null;
    const q = [n.id];
    for (let v = q.shift(); v !== undefined; v = q.shift()) {
      for (const { to } of und.get(v) ?? []) {
        if (!(to in side)) {
          side[to] = (1 - side[v]) as 0 | 1;
          parent[to] = v;
          q.push(to);
        } else if (side[to] === side[v]) {
          // odd cycle: paths from v and `to` up to their common ancestor
          const up = (x: string) => {
            const p: string[] = [];
            for (let c: string | null = x; c !== null; c = parent[c]) p.push(c);
            return p;
          };
          const a = up(v),
            b = up(to);
          const common = must(
            a.find((x) => b.includes(x)),
            'common ancestor',
          );
          const cycle = [...a.slice(0, a.indexOf(common) + 1), ...b.slice(0, b.indexOf(common)).reverse()];
          return { ok: false, cycle, side };
        }
      }
    }
  }
  return { ok: true, side };
}

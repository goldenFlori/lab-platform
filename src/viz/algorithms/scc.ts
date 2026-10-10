/* =====================================================================
 *  Strongly connected components & topological orders
 *  Laboratori 6 (Ushtrimet 4–6 të fletores së Laboratorit 5).
 *
 *  SCCs are found exactly the way the lab does it (bfs_reach /
 *  analyze_scc): SCC(v) = reach⁺(v) ∩ reach⁻(v).
 * ===================================================================== */

import type { GEdge, GNode } from '../kit/GraphCanvas';
import { natural } from './graphs';

export function reach(nodes: GNode[], edges: GEdge[], from: string, backwards = false): string[] {
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (backwards) adj.get(e.v)?.push(e.u);
    else adj.get(e.u)?.push(e.v);
  }
  const seen = new Set([from]);
  const q = [from];
  for (let v = q.shift(); v !== undefined; v = q.shift()) {
    for (const w of (adj.get(v) ?? []).sort(natural)) {
      if (seen.has(w)) continue;
      seen.add(w);
      q.push(w);
    }
  }
  return [...seen].sort(natural);
}

export interface SccStep {
  note: string;
  pivot: string | null;
  forward: string[];
  backward: string[];
  /** finished components, in discovery order */
  comps: string[][];
  line?: number;
}

export function sccSteps(nodes: GNode[], edges: GEdge[]): SccStep[] {
  const steps: SccStep[] = [];
  const comps: string[][] = [];
  const assigned = new Set<string>();
  const ids = nodes.map((n) => n.id).sort(natural);
  steps.push({
    note: 'Për çdo kulm të pacaktuar v: SCC(v) = **reach⁺(v) ∩ reach⁻(v)** — kulmet që v i arrin **dhe** që e arrijnë v.',
    pivot: null,
    forward: [],
    backward: [],
    comps: [],
    line: 0,
  });
  for (const v of ids) {
    if (assigned.has(v)) continue;
    const fwd = reach(nodes, edges, v);
    steps.push({
      note: `Zgjedhim **${v}**. BFS përpara: reach⁺(${v}) = {${fwd.join(', ')}} — kulmet që arrihen nga ${v}.`,
      pivot: v,
      forward: fwd,
      backward: [],
      comps: comps.map((c) => [...c]),
      line: 1,
    });
    const bwd = reach(nodes, edges, v, true);
    steps.push({
      note: `BFS mbrapa (harqet e kthyera): reach⁻(${v}) = {${bwd.join(', ')}} — kulmet që arrijnë ${v}.`,
      pivot: v,
      forward: fwd,
      backward: bwd,
      comps: comps.map((c) => [...c]),
      line: 2,
    });
    const comp = fwd.filter((x) => bwd.includes(x));
    for (const x of comp) assigned.add(x);
    comps.push(comp);
    steps.push({
      note: `Prerja jep **SCC ${comps.length} = {${comp.join(', ')}}**${comp.length === 1 ? ' — një kulm i vetëm, pa cikël që e kthen.' : '.'}`,
      pivot: v,
      forward: fwd,
      backward: bwd,
      comps: comps.map((c) => [...c]),
      line: 3,
    });
  }
  steps.push({
    note:
      comps.length === 1
        ? `Një komponente e vetme: digrafi **është i lidhur fort** — çdo kulm arrin çdo kulm.`
        : `Gjithsej **${comps.length} komponente të lidhura fort**. Digrafi nuk është i lidhur fort.`,
    pivot: null,
    forward: [],
    backward: [],
    comps: comps.map((c) => [...c]),
  });
  return steps;
}

/* ------------------------------------------------------------- topo */

export function predecessors(nodes: GNode[], edges: GEdge[]) {
  const pred = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) pred.get(e.v)?.push(e.u);
  return pred;
}

/** Vertices whose prerequisites are all already placed — the lab's available_nodes. */
export function available(nodes: GNode[], edges: GEdge[], placed: string[]) {
  const pred = predecessors(nodes, edges);
  const done = new Set(placed);
  return nodes
    .map((n) => n.id)
    .filter((v) => !done.has(v) && (pred.get(v) ?? []).every((p) => done.has(p)))
    .sort(natural);
}

export function hasCycle(nodes: GNode[], edges: GEdge[]) {
  const placed: string[] = [];
  for (;;) {
    const av = available(nodes, edges, placed);
    if (!av.length) break;
    placed.push(av[0]);
  }
  return placed.length < nodes.length;
}

/** Counts all topological orders (and keeps the first few). */
export function allOrders(nodes: GNode[], edges: GEdge[], keep = 40) {
  const pred = predecessors(nodes, edges);
  const ids = nodes.map((n) => n.id).sort(natural);
  const list: string[][] = [];
  let count = 0;
  const cur: string[] = [];
  const used = new Set<string>();
  const memo = new Map<string, number>();
  // count with memo over subsets (fine up to ~20 vertices)
  const countFrom = (mask: number): number => {
    if (mask === (1 << ids.length) - 1) return 1;
    const key = String(mask);
    const known = memo.get(key);
    if (known !== undefined) return known;
    let total = 0;
    ids.forEach((v, i) => {
      if (mask & (1 << i)) return;
      if ((pred.get(v) ?? []).every((p) => mask & (1 << ids.indexOf(p)))) total += countFrom(mask | (1 << i));
    });
    memo.set(key, total);
    return total;
  };
  count = ids.length <= 20 ? countFrom(0) : 0;
  const walk = () => {
    if (list.length >= keep) return;
    if (cur.length === ids.length) {
      list.push([...cur]);
      return;
    }
    for (const v of ids) {
      if (used.has(v) || !(pred.get(v) ?? []).every((p) => used.has(p))) continue;
      used.add(v);
      cur.push(v);
      walk();
      cur.pop();
      used.delete(v);
    }
  };
  walk();
  return { count, list };
}

/** Left-to-right layering by longest path from the sources. */
export function layeredLayout(ids: string[], edges: GEdge[], width: number, height: number) {
  const pred = new Map<string, string[]>(ids.map((v) => [v, []]));
  for (const e of edges) pred.get(e.v)?.push(e.u);
  const layer = new Map<string, number>();
  const depth = (v: string, guard = 0): number => {
    const known = layer.get(v);
    if (known !== undefined) return known;
    if (guard > ids.length) return 0;
    const d = Math.max(0, ...(pred.get(v) ?? []).map((p) => depth(p, guard + 1) + 1));
    layer.set(v, d);
    return d;
  };
  for (const v of ids) depth(v);
  const maxL = Math.max(0, ...layer.values());
  const byLayer = new Map<number, string[]>();
  for (const v of ids) {
    const l = layer.get(v) ?? 0;
    const col = byLayer.get(l);
    if (col) col.push(v);
    else byLayer.set(l, [v]);
  }
  const padX = 80,
    padY = 50;
  return ids.map((id) => {
    const l = layer.get(id) ?? 0;
    const col = byLayer.get(l) ?? [id];
    const k = col.indexOf(id);
    const x = maxL === 0 ? width / 2 : padX + (l * (width - 2 * padX)) / maxL;
    const y = col.length === 1 ? height / 2 : padY + (k * (height - 2 * padY)) / (col.length - 1);
    return { id, x, y };
  });
}

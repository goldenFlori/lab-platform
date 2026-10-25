/* =====================================================================
 *  Recursion trees (#133): Merge Sort's calls, split down and merged
 *  up, with the work per level; and recursive Fibonacci, with its
 *  repeated calls and what memoization saves. Each call is a node; the
 *  steps reveal them in the order the recursion makes them.
 * ===================================================================== */

import type { RecursionText } from './recursion.text';

export interface TreeNode {
  id: number;
  parent: number | null;
  depth: number;
  /** Horizontal position, 0 … 1. */
  x: number;
  label: string;
}

export interface MergeNode extends TreeNode {
  values: number[];
  sorted: number[];
  /** Comparisons its merge makes (0 for a leaf). */
  comparisons: number;
}

export interface MergeStep {
  note: string;
  /** Nodes called so far. */
  shown: number[];
  /** Nodes whose part is sorted (leaves, then merges). */
  sorted: number[];
  active: number | null;
  /** Comparisons so far, per depth of the merging node. */
  perLevel: number[];
  total: number;
}

const fmt = (list: number[]) => `[${list.join(', ')}]`;

export function mergeTree(values: number[], text: RecursionText): { nodes: MergeNode[]; steps: MergeStep[] } {
  const T = text.merge;
  const n = values.length;
  const nodes: MergeNode[] = [];
  const steps: MergeStep[] = [];
  const shown: number[] = [];
  const sorted: number[] = [];
  const depthCount = Math.ceil(Math.log2(Math.max(n, 1))) + 1;
  const perLevel = Array.from({ length: depthCount }, () => 0);
  let total = 0;
  const snap = (note: string, active: number | null) =>
    steps.push({ note, shown: [...shown], sorted: [...sorted], active, perLevel: [...perLevel], total });

  const visit = (lo: number, hi: number, parent: number | null, depth: number): number => {
    const id = nodes.length;
    const part = values.slice(lo, hi);
    nodes.push({
      id,
      parent,
      depth,
      x: (lo + hi) / 2 / n,
      label: fmt(part),
      values: part,
      sorted: part,
      comparisons: 0,
    });
    shown.push(id);
    if (hi - lo <= 1) {
      sorted.push(id);
      snap(T.base(fmt(part)), id);
      return id;
    }
    snap(T.call(fmt(part)), id);
    const mid = Math.floor((lo + hi) / 2);
    const l = nodes[visit(lo, mid, id, depth + 1)] as MergeNode;
    const r = nodes[visit(mid, hi, id, depth + 1)] as MergeNode;
    const out: number[] = [];
    let i = 0;
    let j = 0;
    let cmp = 0;
    while (i < l.sorted.length && j < r.sorted.length) {
      cmp++;
      if ((l.sorted[i] ?? 0) <= (r.sorted[j] ?? 0)) out.push(l.sorted[i++] ?? 0);
      else out.push(r.sorted[j++] ?? 0);
    }
    out.push(...l.sorted.slice(i), ...r.sorted.slice(j));
    const node = nodes[id] as MergeNode;
    node.sorted = out;
    node.comparisons = cmp;
    perLevel[depth] = (perLevel[depth] ?? 0) + cmp;
    total += cmp;
    sorted.push(id);
    snap(T.merged(fmt(l.sorted), fmt(r.sorted), fmt(out), cmp), id);
    return id;
  };

  if (n) visit(0, n, null, 0);
  snap(T.done(n, depthCount - 1, total), null);
  return { nodes, steps };
}

export interface FibNode extends TreeNode {
  k: number;
  value: number;
  /** Answered from the memo, without calls of its own. */
  memo: boolean;
  /** fib(k) had already been computed before this call (repeated work). */
  repeat: boolean;
}

export interface FibStep {
  note: string;
  shown: number[];
  returned: number[];
  active: number | null;
  calls: number;
}

export function fibTree(n: number, memo: boolean, text: RecursionText): { nodes: FibNode[]; steps: FibStep[] } {
  const T = text.fib;
  const nodes: FibNode[] = [];
  const steps: FibStep[] = [];
  const shown: number[] = [];
  const returned: number[] = [];
  const cache = new Map<number, number>();
  const seen = new Map<number, number>();
  const snap = (note: string, active: number | null) =>
    steps.push({ note, shown: [...shown], returned: [...returned], active, calls: shown.length });

  const visit = (k: number, parent: number | null, depth: number): number => {
    const id = nodes.length;
    const times = (seen.get(k) ?? 0) + 1;
    seen.set(k, times);
    const cached = memo && cache.has(k);
    nodes.push({ id, parent, depth, x: 0, label: `fib(${k})`, k, value: 0, memo: cached, repeat: !memo && times > 1 });
    shown.push(id);
    const node = nodes[id] as FibNode;
    if (cached) {
      node.value = cache.get(k) ?? 0;
      returned.push(id);
      snap(T.memo(k, node.value), id);
      return id;
    }
    snap(node.repeat ? T.repeat(k, times) : T.call(k), id);
    if (k < 2) {
      node.value = k;
      returned.push(id);
      snap(T.base(k), id);
    } else {
      const a = nodes[visit(k - 1, id, depth + 1)] as FibNode;
      const b = nodes[visit(k - 2, id, depth + 1)] as FibNode;
      node.value = a.value + b.value;
      returned.push(id);
      snap(T.ret(k, a.value, b.value, node.value), id);
    }
    if (memo) cache.set(k, node.value);
    return id;
  };

  visit(n, null, 0);
  // A tidy layout: leaves left to right, each parent above the middle of its children.
  let leaf = 0;
  const children = (id: number) => nodes.filter((c) => c.parent === id);
  const place = (id: number): number => {
    const node = nodes[id] as FibNode;
    const kids = children(id);
    node.x = kids.length ? kids.map((c) => place(c.id)).reduce((s, x) => s + x, 0) / kids.length : leaf++;
    return node.x;
  };
  place(0);
  for (const node of nodes) node.x = leaf > 1 ? node.x / (leaf - 1) : 0.5;
  snap(T.done(n, (nodes[0] as FibNode).value, nodes.length), null);
  return { nodes, steps };
}

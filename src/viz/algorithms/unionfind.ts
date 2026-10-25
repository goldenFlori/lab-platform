/* =====================================================================
 *  Kruskal with union-find shown (#132): the disjoint-set forest is
 *  part of every step, with union by rank and full path compression,
 *  so students see why the greedy test "different roots?" is fast.
 * ===================================================================== */

import type { GEdge, GNode } from '../kit/GraphCanvas';
import type { UnionFindText } from './unionfind.text';

export interface UnionFindStep {
  note: string;
  parent: Record<string, string>;
  rank: Record<string, number>;
  considering: number | null;
  tree: number[];
  rejected: number[];
  weight: number;
  /** The vertices a find walked through, for both ends of the edge. */
  path: string[];
  /** Vertices whose parent was just changed by path compression or a union. */
  moved: string[];
}

export function kruskalUnionFind(nodes: GNode[], edges: GEdge[], text: UnionFindText): UnionFindStep[] {
  const T = text;
  const parent: Record<string, string> = Object.fromEntries(nodes.map((n) => [n.id, n.id]));
  const rank: Record<string, number> = Object.fromEntries(nodes.map((n) => [n.id, 0]));
  const order = edges
    .map((_, i) => i)
    .filter((i) => edges[i]?.u !== edges[i]?.v)
    .sort((a, b) => (edges[a]?.w ?? 0) - (edges[b]?.w ?? 0));
  const label = (i: number) => `${edges[i]?.u}–${edges[i]?.v}(${edges[i]?.w ?? 0})`;
  const tree: number[] = [];
  const rejected: number[] = [];
  let weight = 0;
  const steps: UnionFindStep[] = [];
  const snap = (note: string, considering: number | null, path: string[] = [], moved: string[] = []) =>
    steps.push({
      note,
      parent: { ...parent },
      rank: { ...rank },
      considering,
      tree: [...tree],
      rejected: [...rejected],
      weight,
      path,
      moved,
    });

  /** The root of x and the path walked to it; then every vertex on the path points at the root. */
  const find = (x: string) => {
    const path = [x];
    while (parent[path[path.length - 1] ?? x] !== path[path.length - 1]) {
      path.push(parent[path[path.length - 1] ?? x] ?? x);
    }
    const root = path[path.length - 1] ?? x;
    const moved = path.slice(0, -2).filter((v) => parent[v] !== root);
    for (const v of moved) parent[v] = root;
    return { root, path, moved };
  };

  snap(T.start(order.map(label).join(', ')), null);
  for (const i of order) {
    const e = edges[i];
    if (!e) continue;
    const a = find(e.u);
    const b = find(e.v);
    const moved = [...a.moved, ...b.moved];
    snap(
      T.consider(label(i), a.path.join(' → '), a.root, b.path.join(' → '), b.root) +
        (moved.length ? T.compressed(moved.join(', ')) : ''),
      i,
      [...a.path, ...b.path],
      moved,
    );
    if (a.root === b.root) {
      rejected.push(i);
      snap(T.reject(a.root), i, [...a.path, ...b.path]);
      continue;
    }
    // Union by rank: the shorter tree goes under the taller one.
    const [low, high] = (rank[a.root] ?? 0) < (rank[b.root] ?? 0) ? [a.root, b.root] : [b.root, a.root];
    const tie = rank[a.root] === rank[b.root];
    parent[low] = high;
    if (tie) rank[high] = (rank[high] ?? 0) + 1;
    tree.push(i);
    weight += e.w ?? 0;
    snap(tie ? T.unionTie(low, high, rank[high] ?? 0) : T.unionRank(low, high), i, [], [low]);
    if (tree.length === nodes.length - 1) break;
  }
  snap(T.done(tree.length, weight), null);
  return steps;
}

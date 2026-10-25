/* =====================================================================
 *  Predict mode (#127): the decisions in a run of steps, as questions.
 *  A question for step k is asked before step k is shown; its options
 *  come from the algorithm's own state at step k − 1.
 * ===================================================================== */

import type { PredictionTopic } from '../../shared/predictions';
import type { GEdge } from '../kit/GraphCanvas';
import { type MstStep, natural, type TraversalStep } from './graphs';
import type { FlowStep } from './maxflow';
import type { PredictText } from './predict.text';
import { type FwStep, INF, inf, type PathStep } from './shortest';
import type { SortStep } from './sorting';

export interface Question {
  /** The algorithm it practises, for the student's results per topic (#151). */
  topic: PredictionTopic;
  prompt: string;
  options: { id: string; label: string }[];
  /** Every option that counts as right (several when there is a tie). */
  answers: string[];
  /** The right answer as shown when the guess was wrong. */
  answerLabel: string;
  explain: string;
}

const unique = <T>(list: T[]) => [...new Set(list)];

// Options never come in the structure's own order: listing a queue front-first, or values sorted,
// would give the answer away. Vertices go alphabetically, values in their array order.

/** BFS or DFS: which vertex leaves the queue or the stack. Asked when a vertex is visited. */
export function traversalQuestion(
  steps: TraversalStep[],
  k: number,
  kind: 'bfs' | 'dfs',
  T: PredictText,
): Question | null {
  const step = steps[k];
  const before = steps[k - 1];
  if (!step || !before || !step.current || step.order.length <= before.order.length) return null;
  const options = unique(before.frontier).sort(natural);
  if (options.length < 2 || !options.includes(step.current)) return null;
  return {
    topic: kind,
    prompt: T[kind].prompt,
    options: options.map((v) => ({ id: v, label: v })),
    answers: [step.current],
    answerLabel: step.current,
    explain: T[kind].explain(step.current),
  };
}

/** Dijkstra: which unsettled vertex it settles next. Asked when a vertex is chosen. */
export function dijkstraQuestion(steps: PathStep[], k: number, T: PredictText): Question | null {
  const step = steps[k];
  const before = steps[k - 1];
  if (!step || !before || !step.current || step.relaxing !== null || step.settled.length <= before.settled.length)
    return null;
  const candidates = Object.keys(before.dist)
    .filter((v) => !before.settled.includes(v) && before.dist[v] !== INF)
    .sort(natural);
  if (candidates.length < 2) return null;
  const best = Math.min(...candidates.map((v) => before.dist[v] ?? INF));
  const answers = candidates.filter((v) => before.dist[v] === best);
  return {
    topic: 'dijkstra',
    prompt: T.dijkstra.prompt,
    options: candidates.map((v) => ({ id: v, label: `${v} · ${inf(before.dist[v] ?? INF)}` })),
    answers,
    answerLabel: step.current,
    explain: T.dijkstra.explain(step.current, inf(best), answers.length > 1),
  };
}

/** Selection Sort: which value ends up in position i. Asked before the scan for it starts. */
export function selectionQuestion(steps: SortStep[], k: number, T: PredictText): Question | null {
  const step = steps[k];
  if (step?.line !== 1 || !step.compare) return null;
  const i = step.compare[0] ?? 0;
  const rest = step.arr.slice(i);
  const options = unique(rest);
  if (options.length < 2) return null;
  const min = Math.min(...rest);
  return {
    topic: 'selection',
    prompt: T.selection.prompt(i),
    options: options.map((v) => ({ id: String(v), label: String(v) })),
    answers: [String(min)],
    answerLabel: String(min),
    explain: T.selection.explain(min),
  };
}

/** Insertion Sort: the index where the key a[i] lands in the sorted prefix. Asked as it is taken. */
export function insertionQuestion(steps: SortStep[], k: number, T: PredictText): Question | null {
  const step = steps[k];
  if (step?.line !== 1 || !step.compare) return null;
  const i = step.compare[0] ?? 0;
  const key = step.arr[i];
  if (key === undefined || i < 1) return null;
  // Equal values stay before the key (the loop shifts only larger ones), so the sort is stable.
  const at = step.arr.slice(0, i).filter((x) => x <= key).length;
  return {
    topic: 'insertion',
    prompt: T.insertion.prompt(key, i),
    options: Array.from({ length: i + 1 }, (_, p) => ({ id: String(p), label: String(p) })),
    answers: [String(at)],
    answerLabel: String(at),
    explain: T.insertion.explain(key, at, i - at),
  };
}

/**
 * Merge Sort: which head is written next while merging two halves. Not asked for equal heads, nor
 * in merges of two single elements, where it is only "which of two is smaller".
 */
export function mergeQuestion(steps: SortStep[], k: number, T: PredictText): Question | null {
  const step = steps[k];
  if (!step?.heads || !step.compare || !step.range) return null;
  const [a, b] = step.heads;
  if (a === b || step.range[1] - step.range[0] < 2) return null;
  const v = Math.min(a, b);
  return {
    topic: 'merge',
    prompt: T.merge.prompt(step.compare[0] ?? 0),
    options: [
      { id: 'left', label: T.merge.left(a) },
      { id: 'right', label: T.merge.right(b) },
    ],
    answers: [a <= b ? 'left' : 'right'],
    answerLabel: String(v),
    explain: T.merge.explain(a, b, v),
  };
}

/** Keep or change a distance: the two options, always in this order. */
function keepOrUpdate(old: number, next: number, T: PredictText) {
  const better = next < old;
  const options = [
    { id: 'keep', label: T.keep(inf(old)) },
    { id: 'update', label: T.update(inf(next)) },
  ];
  return {
    better,
    options,
    answers: [better ? 'update' : 'keep'],
    answerLabel: better ? T.update(inf(next)) : T.keep(inf(old)),
  };
}

/** A relaxation that can go either way: dist[u] and dist[v] finite, and dist[u] + w ≠ dist[v]. */
function openRelaxation(steps: PathStep[], k: number) {
  const step = steps[k];
  const before = steps[k - 1];
  if (!step?.arc || !before) return null;
  const { u, v, w } = step.arc;
  const du = before.dist[u] ?? INF;
  const old = before.dist[v] ?? INF;
  if (du === INF || old === INF || du + w === old) return null;
  return { u, v, w, du, old, iteration: step.iteration };
}

/** Questions per Bellman-Ford pass at most. */
export const BELLMAN_PER_PASS = 4;

/**
 * Bellman-Ford: what a relaxation does to dist[v]. Not asked when dist[u] or dist[v] is still ∞
 * (nothing to decide: ∞ never improves anything, and anything improves ∞), nor when they are
 * equal; and only the first BELLMAN_PER_PASS of each pass, by their order.
 */
export function bellmanQuestion(steps: PathStep[], k: number, T: PredictText): Question | null {
  const r = openRelaxation(steps, k);
  if (!r) return null;
  let earlier = 0;
  for (let x = k - 1; x >= 0 && steps[x]?.iteration === r.iteration; x--) if (openRelaxation(steps, x)) earlier++;
  if (earlier >= BELLMAN_PER_PASS) return null;
  const { u, v, w, du, old } = r;
  const q = keepOrUpdate(old, du + w, T);
  return {
    topic: 'bellman',
    prompt: T.bellman.prompt(u, v, w),
    options: q.options,
    answers: q.answers,
    answerLabel: q.answerLabel,
    explain: T.bellman.explain(u, v, inf(du), w, inf(du + w), inf(old), q.better),
  };
}

/** A Floyd-Warshall comparison that can go either way: both sides finite and different. */
function openComparison(steps: FwStep[], k: number) {
  const step = steps[k];
  const before = steps[k - 1];
  if (step?.phase !== 'cmp' || !before) return null;
  const { i, j, k: m } = step;
  const old = before.D[i]?.[j] ?? INF;
  const ik = before.D[i]?.[m] ?? INF;
  const kj = before.D[m]?.[j] ?? INF;
  if (ik === INF || kj === INF || old === INF || ik + kj === old) return null;
  return { i, j, m, old, ik, kj };
}

/** Questions per k at most: enough to practise the rule, without hundreds on a larger graph. */
export const FLOYD_PER_K = 3;

/**
 * Floyd-Warshall: what one comparison through k does to D[i][j]. Only the first FLOYD_PER_K open
 * comparisons of each k are asked, chosen by their order, never by their outcome.
 */
export function floydQuestion(steps: FwStep[], k: number, L: string[], T: PredictText): Question | null {
  const cmp = openComparison(steps, k);
  if (!cmp) return null;
  let earlier = 0;
  for (let x = k - 1; x >= 0 && steps[x]?.phase === 'cmp'; x--) if (openComparison(steps, x)) earlier++;
  if (earlier >= FLOYD_PER_K) return null;
  const { i, j, m, old, ik, kj } = cmp;
  const q = keepOrUpdate(old, ik + kj, T);
  const [a, b, c] = [L[i] ?? '', L[j] ?? '', L[m] ?? ''];
  return {
    topic: 'floyd',
    prompt: T.floyd.prompt(a, b, c),
    options: q.options,
    answers: q.answers,
    answerLabel: q.answerLabel,
    explain: T.floyd.explain(a, b, c, inf(ik), inf(kj), inf(ik + kj), inf(old), q.better),
  };
}

const edgeLabel = (e: GEdge) => `${e.u}–${e.v} (${e.w ?? 0})`;

/** The part of a Kruskal step the question needs: plain Kruskal and Kruskal with union-find both have it. */
interface KruskalLike {
  considering: number | null;
  tree: number[];
  rejected: number[];
}

/**
 * Kruskal: accept or reject the next edge in weight order, asked as it comes up. Not asked while
 * the tree has fewer than two edges: the first two always join (a cycle needs three).
 */
export function kruskalQuestion(steps: KruskalLike[], k: number, edges: GEdge[], T: PredictText): Question | null {
  const step = steps[k];
  const before = steps[k - 1];
  if (!step || !before || step.considering === null || step.considering === before.considering) return null;
  const e = edges[step.considering];
  if (!e || before.tree.length < 2) return null;
  const rejected = steps.at(-1)?.rejected.includes(step.considering) ?? false;
  return {
    topic: 'kruskal',
    prompt: T.kruskal.prompt(edgeLabel(e)),
    options: [
      { id: 'accept', label: T.kruskal.accept },
      { id: 'reject', label: T.kruskal.reject },
    ],
    answers: [rejected ? 'reject' : 'accept'],
    answerLabel: rejected ? T.kruskal.reject : T.kruskal.accept,
    explain: rejected ? T.kruskal.explainReject(e.u, e.v) : T.kruskal.explainAccept(e.u, e.v),
  };
}

/** Prim: which edge joins the tree next, among those crossing the cut (ties accepted). */
export function primQuestion(steps: MstStep[], k: number, edges: GEdge[], T: PredictText): Question | null {
  const step = steps[k];
  if (step?.line !== 1 || step.considering === null) return null;
  const inTree = new Set(step.inTree);
  const crossing = edges
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.u !== e.v && inTree.has(e.u) !== inTree.has(e.v))
    .sort((a, b) => natural(a.e.u, b.e.u) || natural(a.e.v, b.e.v));
  if (crossing.length < 2) return null;
  const best = Math.min(...crossing.map(({ e }) => e.w ?? 0));
  const answers = crossing.filter(({ e }) => (e.w ?? 0) === best).map(({ i }) => String(i));
  const chosen = edges[step.considering];
  if (!chosen) return null;
  return {
    topic: 'prim',
    prompt: T.prim.prompt(step.inTree.join(', ')),
    options: crossing.map(({ e, i }) => ({ id: String(i), label: edgeLabel(e) })),
    answers,
    answerLabel: edgeLabel(chosen),
    explain: T.prim.explain(edgeLabel(chosen), answers.length > 1),
  };
}

/**
 * Max flow: the bottleneck of the augmenting path just found. Options are the residual capacities
 * in the order the path meets them; not asked when they are all equal.
 */
export function bottleneckQuestion(steps: FlowStep[], k: number, s: string, T: PredictText): Question | null {
  const step = steps[k];
  if (step?.phase !== 'path' || !step.path.length) return null;
  const caps = step.path.map((a) => a.cap);
  const options = unique(caps);
  if (options.length < 2) return null;
  const x = Math.min(...caps);
  return {
    topic: 'flow',
    prompt: T.flow.prompt([s, ...step.path.map((a) => a.v)].join(' → ')),
    options: options.map((c) => ({ id: String(c), label: String(c) })),
    answers: [String(x)],
    answerLabel: String(x),
    explain: T.flow.explain(caps.join(', '), x),
  };
}

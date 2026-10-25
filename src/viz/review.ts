/* =====================================================================
 *  The review session (#152): one predict question per item, on a fresh
 *  small random input, with the state it is asked in, so it stands on
 *  its own outside the visualization. The questions are predict mode's
 *  own (algorithms/predict.ts), so they are checked by the same tests.
 * ===================================================================== */

import type { PredictionTopic, TopicResult } from '../shared/predictions';
import type { ReviewTopic } from '../shared/review';
import { bfsSteps, dfsSteps, kruskalSteps, primSteps } from './algorithms/graphs';
import { maxflowSteps } from './algorithms/maxflow';
import {
  bellmanQuestion,
  bottleneckQuestion,
  dijkstraQuestion,
  floydQuestion,
  insertionQuestion,
  kruskalQuestion,
  primQuestion,
  type Question,
  selectionQuestion,
  traversalQuestion,
} from './algorithms/predict';
import type { PredictText } from './algorithms/predict.text';
import { available } from './algorithms/scc';
import { bellmanFordSteps, dijkstraSteps, floydSteps, toArcs, weightMatrix } from './algorithms/shortest';
import { insertionSteps, selectionSteps } from './algorithms/sorting';
import { SORTING_TEXT } from './algorithms/sorting.text';
import type { GEdge, GNode } from './kit/GraphCanvas';

export type Random = () => number;

/** What a question is asked about, drawn beside it. */
export type ReviewView =
  /** An array: the first `done` places are sorted; `key` is the element being placed. */
  | { kind: 'array'; values: number[]; done: number; key: number | null }
  /** A merge in progress: what is left of each half, and what is written so far. */
  | { kind: 'merge'; left: number[]; right: number[]; written: number[] }
  | {
      kind: 'graph';
      nodes: GNode[];
      edges: GEdge[];
      directed: boolean;
      /** Finished vertices (visited, settled, in the tree, placed). */
      done: string[];
      /** Vertices waiting (BFS's queue, DFS's stack). */
      waiting: string[];
      dist: Record<string, number> | null;
      tree: number[];
      rejected: number[];
      /** Edges the question is about (a relaxed edge, an augmenting path). */
      focus: number[];
      labels: Record<number, string> | null;
      badges: Record<string, string> | null;
      /** BFS's queue or DFS's stack, in their order. */
      structure: { kind: 'queue' | 'stack'; items: string[] } | null;
    }
  | { kind: 'matrix'; labels: string[]; D: number[][]; k: number; i: number; j: number };

export interface ReviewItem {
  topic: ReviewTopic;
  question: Question;
  view: ReviewView;
}

/* ------------------------------------------------------------ inputs */

const pick = <T>(list: T[], r: Random): T => list[Math.floor(r() * list.length)] as T;

function shuffled<T>(list: T[], r: Random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** n distinct values from 1 to 20. */
const values = (n: number, r: Random) =>
  shuffled(
    Array.from({ length: 20 }, (_, i) => i + 1),
    r,
  ).slice(0, n);

const IDS = ['A', 'B', 'C', 'D', 'E', 'F'];
/** Six vertices on a hexagon, in a 600 × 380 canvas. */
const HEX: GNode[] = IDS.map((id, i) => {
  const angle = ((-90 + 60 * i) * Math.PI) / 180;
  return { id, x: Math.round(300 + 160 * Math.cos(angle)), y: Math.round(190 + 150 * Math.sin(angle)) };
});

/** A connected graph on the hexagon: a random spanning tree, then `extra` more edges. */
function graph(r: Random, extra: number, weight: () => number): GEdge[] {
  const edges: GEdge[] = [];
  const has = (u: string, v: string) => edges.some((e) => (e.u === u && e.v === v) || (e.u === v && e.v === u));
  for (let i = 1; i < IDS.length; i++) {
    const u = IDS[Math.floor(r() * i)] as string;
    edges.push({ u, v: IDS[i] as string, w: weight() });
  }
  for (let tries = 0; edges.length < IDS.length - 1 + extra && tries < 50; tries++) {
    const [u, v] = shuffled(IDS, r) as [string, string];
    if (!has(u, v)) edges.push({ u, v, w: weight() });
  }
  return edges;
}

/** Edges only from an earlier vertex to a later one: a DAG, so no cycle at all. */
function dag(r: Random, extra: number, weight: () => number): GEdge[] {
  const edges: GEdge[] = [];
  for (let i = 1; i < IDS.length; i++)
    edges.push({ u: IDS[Math.floor(r() * i)] as string, v: IDS[i] as string, w: weight() });
  for (let tries = 0; edges.length < IDS.length - 1 + extra && tries < 50; tries++) {
    const [a, b] = [Math.floor(r() * IDS.length), Math.floor(r() * IDS.length)];
    const [u, v] = [IDS[Math.min(a, b)] as string, IDS[Math.max(a, b)] as string];
    if (a !== b && !edges.some((e) => e.u === u && e.v === v)) edges.push({ u, v, w: weight() });
  }
  return edges;
}

const graphView = (
  over: Partial<Extract<ReviewView, { kind: 'graph' }>> & { edges: GEdge[] },
): Extract<ReviewView, { kind: 'graph' }> => ({
  kind: 'graph',
  nodes: HEX,
  directed: false,
  done: [],
  waiting: [],
  dist: null,
  tree: [],
  rejected: [],
  focus: [],
  labels: null,
  badges: null,
  structure: null,
  ...over,
});

/** The steps of a run where a question is asked, and the question. */
function asked<S>(steps: S[], at: (k: number) => Question | null, keep: (k: number) => boolean = () => true) {
  return steps.flatMap((_, k) => {
    const q = keep(k) ? at(k) : null;
    return q ? [{ k, q }] : [];
  });
}

/* ------------------------------------------------------------ items */

type Maker = (T: PredictText, r: Random) => ReviewItem | null;

const S = SORTING_TEXT.sq;

const MAKERS: Record<ReviewTopic, Maker> = {
  insertion(T, r) {
    const steps = insertionSteps(values(6, r), S);
    const q = pick(
      asked(
        steps,
        (k) => insertionQuestion(steps, k, T),
        (k) => (steps[k]?.compare?.[0] ?? 0) >= 2,
      ),
      r,
    );
    if (!q) return null;
    const i = steps[q.k]?.compare?.[0] ?? 0;
    return {
      topic: 'insertion',
      question: q.q,
      view: { kind: 'array', values: steps[q.k]?.arr ?? [], done: i, key: i },
    };
  },

  selection(T, r) {
    const steps = selectionSteps(values(6, r), S);
    const q = pick(
      asked(steps, (k) => selectionQuestion(steps, k, T)),
      r,
    );
    if (!q) return null;
    const i = steps[q.k]?.compare?.[0] ?? 0;
    return {
      topic: 'selection',
      question: q.q,
      view: { kind: 'array', values: steps[q.k]?.arr ?? [], done: i, key: null },
    };
  },

  merge(T, r) {
    const all = values(7, r);
    const left = all.slice(0, 4).sort((a, b) => a - b);
    const right = all.slice(4).sort((a, b) => a - b);
    const written: number[] = [];
    for (let n = Math.floor(r() * 4); n > 0 && left.length > 1 && right.length > 1; n--)
      written.push(((left[0] ?? 0) <= (right[0] ?? 0) ? left.shift() : right.shift()) as number);
    const [a, b] = [left[0] ?? 0, right[0] ?? 0];
    const v = Math.min(a, b);
    return {
      topic: 'merge',
      question: {
        topic: 'merge',
        prompt: T.merge.prompt(written.length),
        options: [
          { id: 'left', label: T.merge.left(a) },
          { id: 'right', label: T.merge.right(b) },
        ],
        answers: [a <= b ? 'left' : 'right'],
        answerLabel: String(v),
        explain: T.merge.explain(a, b, v),
      },
      view: { kind: 'merge', left, right, written },
    };
  },

  bfs: (T, r) => traversal('bfs', T, r),
  dfs: (T, r) => traversal('dfs', T, r),

  dijkstra(T, r) {
    const edges = graph(r, 3, () => 1 + Math.floor(r() * 9));
    const steps = dijkstraSteps(HEX, toArcs(edges, false), 'A');
    const q = pick(
      asked(steps, (k) => dijkstraQuestion(steps, k, T)),
      r,
    );
    const before = q && steps[q.k - 1];
    if (!q || !before) return null;
    return {
      topic: 'dijkstra',
      question: q.q,
      view: graphView({ edges, done: before.settled, dist: before.dist }),
    };
  },

  bellman(T, r) {
    const edges = dag(r, 3, () => Math.floor(r() * 13) - 3);
    const steps = bellmanFordSteps(HEX, toArcs(edges, true), 'A');
    const q = pick(
      asked(steps, (k) => bellmanQuestion(steps, k, T)),
      r,
    );
    const before = q && steps[q.k - 1];
    if (!q || !before) return null;
    const relaxed = steps[q.k]?.relaxing;
    return {
      topic: 'bellman',
      question: q.q,
      view: graphView({ edges, directed: true, dist: before.dist, focus: relaxed == null ? [] : [relaxed] }),
    };
  },

  floyd(T, r) {
    const L = ['0', '1', '2', '3'];
    const edges: GEdge[] = [];
    for (const u of L) for (const v of L) if (u !== v && r() < 0.6) edges.push({ u, v, w: 1 + Math.floor(r() * 9) });
    const steps = floydSteps(weightMatrix(L, edges, true), L);
    const q = pick(
      asked(steps, (k) => floydQuestion(steps, k, L, T)),
      r,
    );
    const [step, before] = q ? [steps[q.k], steps[q.k - 1]] : [];
    if (!q || !step || !before) return null;
    return {
      topic: 'floyd',
      question: q.q,
      view: { kind: 'matrix', labels: L, D: before.D, k: step.k, i: step.i, j: step.j },
    };
  },

  kruskal(T, r) {
    const edges = graph(r, 4, () => 1 + Math.floor(r() * 9));
    const steps = kruskalSteps(HEX, edges);
    const q = pick(
      asked(steps, (k) => kruskalQuestion(steps, k, edges, T)),
      r,
    );
    const [step, before] = q ? [steps[q.k], steps[q.k - 1]] : [];
    if (!q || !step || !before) return null;
    return {
      topic: 'kruskal',
      question: q.q,
      view: graphView({
        edges,
        tree: before.tree,
        rejected: before.rejected,
        focus: step.considering === null ? [] : [step.considering],
      }),
    };
  },

  prim(T, r) {
    const edges = graph(r, 3, () => 1 + Math.floor(r() * 9));
    const steps = primSteps(HEX, edges, 'A');
    const q = pick(
      asked(steps, (k) => primQuestion(steps, k, edges, T)),
      r,
    );
    const step = q && steps[q.k];
    if (!q || !step) return null;
    return { topic: 'prim', question: q.q, view: graphView({ edges, done: step.inTree, tree: step.tree }) };
  },

  flow(T, r) {
    const cap = () => 2 + Math.floor(r() * 8);
    const nodes: GNode[] = [
      { id: 's', x: 70, y: 190 },
      { id: 'a', x: 230, y: 80 },
      { id: 'b', x: 230, y: 300 },
      { id: 'c', x: 390, y: 190 },
      { id: 't', x: 540, y: 190 },
    ];
    const edges: GEdge[] = [
      { u: 's', v: 'a', w: cap() },
      { u: 's', v: 'b', w: cap() },
      { u: 'a', v: 'b', w: cap() },
      { u: 'a', v: 'c', w: cap() },
      { u: 'b', v: 'c', w: cap() },
      { u: 'a', v: 't', w: cap() },
      { u: 'c', v: 't', w: cap() },
    ];
    const steps = maxflowSteps(nodes, edges, 's', 't', 'ek');
    const q = pick(
      asked(steps, (k) => bottleneckQuestion(steps, k, 's', T)),
      r,
    );
    const [step, before] = q ? [steps[q.k], steps[q.k - 1]] : [];
    if (!q || !step || !before) return null;
    return {
      topic: 'flow',
      question: q.q,
      view: graphView({
        nodes,
        edges,
        directed: true,
        focus: step.path.map((a) => a.ei),
        labels: Object.fromEntries(edges.map((e, i) => [i, `${before.flow[i] ?? 0}/${e.w ?? 0}`])),
      }),
    };
  },

  topo(T, r) {
    const edges = dag(r, 3, () => 0).map(({ u, v }) => ({ u, v }));
    // Rename so the order of the letters gives nothing away.
    const order = shuffled(IDS, r);
    const names = new Map(IDS.map((id, i) => [id, order[i] ?? id]));
    const named = edges.map((e) => ({ u: names.get(e.u) ?? e.u, v: names.get(e.v) ?? e.v }));
    const placed: string[] = [];
    for (let n = Math.floor(r() * 3); n > 0; n--) {
      const next = available(HEX, named, placed);
      if (!next.length) break;
      placed.push(pick(next, r));
    }
    const open = available(HEX, named, placed);
    const options = IDS.filter((v) => !placed.includes(v));
    if (options.length < 2 || open.length === options.length) return null;
    return {
      topic: 'topo',
      question: {
        topic: 'topo',
        prompt: T.topo.prompt(placed.join(' → ')),
        options: options.map((v) => ({ id: v, label: v })),
        answers: open,
        answerLabel: open.join(', '),
        explain: T.topo.explain(open.join(', ')),
      },
      view: graphView({
        edges: named,
        directed: true,
        done: placed,
        badges: Object.fromEntries(placed.map((v, i) => [v, String(i + 1)])),
      }),
    };
  },
};

function traversal(kind: 'bfs' | 'dfs', T: PredictText, r: Random): ReviewItem | null {
  const edges = graph(r, 2, () => 1);
  const steps = (kind === 'bfs' ? bfsSteps : dfsSteps)(HEX, edges, false, 'A');
  const q = pick(
    asked(
      steps,
      (k) => traversalQuestion(steps, k, kind, T),
      (k) => (steps[k - 1]?.order.length ?? 0) >= 1,
    ),
    r,
  );
  const before = q && steps[q.k - 1];
  if (!q || !before) return null;
  return {
    topic: kind,
    question: q.q,
    view: graphView({
      edges: edges.map(({ u, v }) => ({ u, v })),
      done: before.order,
      waiting: before.frontier,
      tree: before.tree,
      structure: { kind: kind === 'bfs' ? 'queue' : 'stack', items: before.frontier },
    }),
  };
}

/** One question on the topic, on a fresh input; a few tries for a run that has one. */
export function makeItem(topic: ReviewTopic, T: PredictText, r: Random = Math.random): ReviewItem {
  for (let tries = 0; tries < 30; tries++) {
    const item = MAKERS[topic](T, r);
    // Something to decide: two options or more, and not all of them right (a full tie).
    if (item && item.question.options.length >= 2 && item.question.answers.length < item.question.options.length)
      return item;
  }
  throw new Error(`No review question for ${topic}`);
}

/* ------------------------------------------------------------ session */

/** How much a topic should come back: more for wrong first tries, a little for unseen ones. */
export function weightOf(topic: PredictionTopic, results: TopicResult[]) {
  const mine = results.filter((x) => x.topic === topic);
  const asked = mine.reduce((n, x) => n + x.asked, 0);
  const right = mine.reduce((n, x) => n + x.right, 0);
  return 1 + (asked ? (3 * (asked - right)) / asked : 1.5);
}

export const SESSION_LENGTH = 8;
const MAX_PER_TOPIC = 3;

/**
 * The session's topics: drawn by weight, interleaved (never the same topic twice in a row while
 * another is possible), at most three of each.
 */
export function sessionTopics(
  topics: ReviewTopic[],
  results: TopicResult[],
  r: Random = Math.random,
  length = SESSION_LENGTH,
): ReviewTopic[] {
  const out: ReviewTopic[] = [];
  for (let n = 0; n < length; n++) {
    const fresh = topics.filter((t) => out.filter((x) => x === t).length < MAX_PER_TOPIC);
    if (!fresh.length) break;
    const pool = fresh.length > 1 ? fresh.filter((t) => t !== out.at(-1)) : fresh;
    const weights = pool.map((t) => weightOf(t, results));
    let x = r() * weights.reduce((a, b) => a + b, 0);
    let chosen = pool[pool.length - 1] as ReviewTopic;
    for (const [i, t] of pool.entries()) {
      x -= weights[i] ?? 0;
      if (x <= 0) {
        chosen = t;
        break;
      }
    }
    out.push(chosen);
  }
  return out;
}

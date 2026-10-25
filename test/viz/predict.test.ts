import { describe, expect, it } from 'vitest';
import { kruskalSteps, primSteps } from '../../src/viz/algorithms/graphs';
import { maxflowSteps } from '../../src/viz/algorithms/maxflow';
import {
  BELLMAN_PER_PASS,
  bellmanQuestion,
  bottleneckQuestion,
  FLOYD_PER_K,
  floydQuestion,
  insertionQuestion,
  kruskalQuestion,
  mergeQuestion,
  primQuestion,
  type Question,
} from '../../src/viz/algorithms/predict';
import { PREDICT_TEXT } from '../../src/viz/algorithms/predict.text';
import { bellmanFordSteps, floydSteps, toArcs, weightMatrix } from '../../src/viz/algorithms/shortest';
import { insertionSteps, mergeSteps } from '../../src/viz/algorithms/sorting';
import { SORTING_TEXT } from '../../src/viz/algorithms/sorting.text';
import { kruskalUnionFind } from '../../src/viz/algorithms/unionfind';
import { UNION_FIND_TEXT } from '../../src/viz/algorithms/unionfind.text';
import type { GEdge } from '../../src/viz/kit/GraphCanvas';

// Predict mode's questions (#148) must have the algorithm's own answer: each is checked against
// the step it is asked before, on the course's own inputs.

const T = PREDICT_TEXT.sq;
const S = SORTING_TEXT.sq;

/** Every question of a run, with the index of the step it is asked before. */
function questions<S>(steps: S[], at: (k: number) => Question | null) {
  return steps.flatMap((_, k) => {
    const q = at(k);
    return q ? [{ k, q }] : [];
  });
}

/** How many questions fall in each group (a pass, a k), in order of first appearance. */
function perGroup(asked: { k: number }[], group: (k: number) => number) {
  const counts = new Map<number, number>();
  for (const { k } of asked) counts.set(group(k), (counts.get(group(k)) ?? 0) + 1);
  return [...counts.values()];
}

const nodes = (ids: string) => [...ids].map((id) => ({ id, x: 0, y: 0 }));
const edges = (list: [string, string, number][]): GEdge[] => list.map(([u, v, w]) => ({ u, v, w }));

describe('predict mode questions', () => {
  it('Insertion Sort: where each key lands, on the Lab 1 class problem', () => {
    const steps = insertionSteps([5, 2, 4, 6, 1, 3], S);
    const asked = questions(steps, (k) => insertionQuestion(steps, k, T));
    // Keys 2, 4, 6, 1, 3 land at 0, 1, 3, 0, 2.
    expect(asked.map(({ q }) => q.answers)).toEqual([['0'], ['1'], ['3'], ['0'], ['2']]);
    expect(asked[2]?.q.options.map((o) => o.id)).toEqual(['0', '1', '2', '3']);
    expect(steps.at(-1)?.arr).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('Insertion Sort keeps equal values before the key (stable)', () => {
    const steps = insertionSteps([2, 1, 2], S);
    const last = questions(steps, (k) => insertionQuestion(steps, k, T)).at(-1);
    expect(last?.q.answers).toEqual(['2']);
  });

  it('Merge Sort: the head written next is the one the step writes', () => {
    const steps = mergeSteps([38, 27, 43, 3, 9, 82, 10, 15], S);
    const asked = questions(steps, (k) => mergeQuestion(steps, k, T));
    // 8 values: no question in the four merges of two single elements.
    expect(asked.length).toBe(13);
    expect(asked.every(({ k }) => (steps[k]?.range?.[1] ?? 0) - (steps[k]?.range?.[0] ?? 0) >= 2)).toBe(true);
    for (const { k, q } of asked) {
      const pos = steps[k]?.compare?.[0] ?? -1;
      // The value written at pos shows in the next step's array.
      expect(String(steps[k + 1]?.arr[pos]), q.prompt).toBe(q.answerLabel);
    }
  });

  it('Bellman-Ford: each relaxation asked leaves dist[v] as answered, trivial ones are not asked', () => {
    // The step-by-step notebook's graph (Lab 7), from vertex 1.
    const g = edges([
      ['1', '2', 6],
      ['1', '3', 5],
      ['1', '4', 5],
      ['2', '5', -1],
      ['3', '2', -2],
      ['3', '5', 1],
      ['4', '3', -2],
      ['4', '6', -1],
      ['5', '7', 3],
      ['6', '7', 3],
    ]);
    const steps = bellmanFordSteps(nodes('1234567'), toArcs(g, true), '1');
    const asked = questions(steps, (k) => bellmanQuestion(steps, k, T));
    expect(Math.max(...perGroup(asked, (k) => steps[k]?.iteration ?? 0))).toBe(BELLMAN_PER_PASS);
    for (const { k, q } of asked) {
      const arc = steps[k]?.arc;
      const after = arc ? steps[k]?.dist[arc.v] : undefined;
      expect(q.answerLabel, q.prompt).toBe(q.answers[0] === 'update' ? T.update(String(after)) : T.keep(String(after)));
      // Never asked while either end is still ∞.
      expect(q.explain).not.toContain('∞');
    }
    expect(steps.at(-1)?.dist).toEqual({ 1: 0, 2: 1, 3: 3, 4: 5, 5: 0, 6: 4, 7: 3 });
  });

  it('Floyd-Warshall: each comparison asked leaves D[i][j] as answered, on the Lab 8 class problem', () => {
    const L = ['0', '1', '2', '3'];
    const g = edges([
      ['0', '1', 3],
      ['0', '3', 7],
      ['1', '0', 8],
      ['1', '2', 2],
      ['2', '0', 5],
      ['2', '3', 1],
      ['3', '0', 2],
    ]);
    const steps = floydSteps(weightMatrix(L, g, true), L);
    const asked = questions(steps, (k) => floydQuestion(steps, k, L, T));
    // At most FLOYD_PER_K per k, the first open comparisons of that k.
    expect(perGroup(asked, (k) => steps[k]?.k ?? -1)).toEqual([1, FLOYD_PER_K, FLOYD_PER_K, FLOYD_PER_K]);
    for (const { k, q } of asked) {
      const s = steps[k];
      const after = s ? s.D[s.i]?.[s.j] : undefined;
      expect(q.answerLabel, q.prompt).toBe(q.answers[0] === 'update' ? T.update(String(after)) : T.keep(String(after)));
    }
  });

  // The Kruskal & Prim visualization's graph (#132), whose minimum spanning tree weighs 39.
  const mst = edges([
    ['A', 'B', 7],
    ['A', 'D', 5],
    ['B', 'C', 8],
    ['B', 'D', 9],
    ['B', 'E', 7],
    ['C', 'E', 5],
    ['D', 'E', 15],
    ['D', 'F', 6],
    ['E', 'F', 8],
    ['E', 'G', 9],
    ['F', 'G', 11],
  ]);

  it('Kruskal: accept or reject as the run decides, with and without union-find', () => {
    const runs: { considering: number | null; tree: number[]; rejected: number[]; weight: number }[][] = [
      kruskalSteps(nodes('ABCDEFG'), mst),
      kruskalUnionFind(nodes('ABCDEFG'), mst, UNION_FIND_TEXT.sq),
    ];
    for (const steps of runs) {
      const last = steps.at(-1);
      expect(last?.weight).toBe(39);
      const asked = questions(steps, (k) => kruskalQuestion(steps, k, mst, T));
      // Every edge considered once the tree has two edges, until the tree is complete.
      const considered = [...(last?.tree ?? []), ...(last?.rejected ?? [])].length;
      expect(asked).toHaveLength(considered - 2);
      for (const { k, q } of asked) {
        const i = steps[k]?.considering ?? -1;
        expect(q.answers, q.prompt).toEqual([last?.rejected.includes(i) ? 'reject' : 'accept']);
      }
      expect(asked.filter(({ q }) => q.answers[0] === 'reject')).toHaveLength(last?.rejected.length ?? -1);
    }
  });

  it('Prim: the lightest edge across the cut, options in alphabetical order', () => {
    const steps = primSteps(nodes('ABCDEFG'), mst, 'A');
    expect(steps.at(-1)?.weight).toBe(39);
    const asked = questions(steps, (k) => primQuestion(steps, k, mst, T));
    // From A: A–B (7) or A–D (5); Prim takes A–D.
    expect(asked[0]?.q.options.map((o) => o.label)).toEqual(['A–B (7)', 'A–D (5)']);
    expect(asked[0]?.q.answers).toEqual(['1']);
    for (const { k, q } of asked) expect(q.answers, q.prompt).toContain(String(steps[k]?.considering));
  });

  it('Edmonds-Karp: the bottleneck is the smallest residual capacity, on the Lab 9 ISP network', () => {
    const isp = edges([
      ['S', 'RA', 20],
      ['S', 'RB', 15],
      ['RA', 'SW1', 12],
      ['RA', 'SW2', 8],
      ['RB', 'SW1', 7],
      ['RB', 'SW2', 10],
      ['SW1', 'T', 14],
      ['SW2', 'T', 11],
    ]);
    const steps = maxflowSteps([], isp, 'S', 'T', 'ek');
    expect(steps.at(-1)?.value).toBe(25);
    const asked = questions(steps, (k) => bottleneckQuestion(steps, k, 'S', T));
    expect(asked.length).toBeGreaterThan(0);
    for (const { k, q } of asked) expect(q.answers, q.prompt).toEqual([String(steps[k]?.x)]);
  });
});

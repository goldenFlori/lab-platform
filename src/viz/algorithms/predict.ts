/* =====================================================================
 *  Predict mode (#127): the decisions in a run of steps, as questions.
 *  A question for step k is asked before step k is shown; its options
 *  come from the algorithm's own state at step k − 1.
 * ===================================================================== */

import { natural, type TraversalStep } from './graphs';
import type { PredictText } from './predict.text';
import { INF, inf, type PathStep } from './shortest';
import type { SortStep } from './sorting';

export interface Question {
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
    prompt: T.selection.prompt(i),
    options: options.map((v) => ({ id: String(v), label: String(v) })),
    answers: [String(min)],
    answerLabel: String(min),
    explain: T.selection.explain(min),
  };
}

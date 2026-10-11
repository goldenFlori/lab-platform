import type { SortStep } from './sorting';

// "Your code, visualized" (#69): what the vizlab module recorded in a student's run, turned into
// the sorting visualizer's steps, with the same colours and counters as the reference algorithms.

export type VizlabEvent =
  | { op: 'start'; arr: number[] }
  | { op: 'compare'; arr: number[]; i: number; j: number }
  | { op: 'write'; arr: number[]; i: number }
  | { op: 'swap'; arr: number[]; i: number; j: number }
  | { op: 'done'; arr: number[]; indices: number[] };

export type VizlabRun = { kind: 'sorting'; events: VizlabEvent[]; truncated: boolean };

/** What the steps say; the words are in vizlab.text.ts, in both languages. */
export type VizlabText = {
  start: (arr: number[]) => string;
  compare: (i: number, a: number, j: number, b: number) => string;
  write: (i: number, v: number) => string;
  swap: (i: number, j: number) => string;
  done: (list: string) => string;
  sorted: string;
  unsorted: string;
  truncated: string;
};

const isSorted = (arr: number[]) => arr.every((v, i) => i === 0 || (arr[i - 1] ?? v) <= v);

export function vizlabSteps(run: VizlabRun, text: VizlabText): SortStep[] {
  const steps: SortStep[] = [];
  const done = new Set<number>();
  let comparisons = 0;
  let writes = 0;
  for (const e of run.events) {
    const base = { arr: e.arr, comparisons, writes, sortedSet: [...done] };
    if (e.op === 'start') steps.push({ ...base, note: text.start(e.arr) });
    if (e.op === 'compare') {
      comparisons++;
      steps.push({
        ...base,
        comparisons,
        compare: [e.i, e.j],
        note: text.compare(e.i, e.arr[e.i] ?? 0, e.j, e.arr[e.j] ?? 0),
      });
    }
    if (e.op === 'write') {
      writes++;
      steps.push({ ...base, writes, write: [e.i], note: text.write(e.i, e.arr[e.i] ?? 0) });
    }
    if (e.op === 'swap') {
      writes += 2;
      steps.push({ ...base, writes, write: [e.i, e.j], note: text.swap(e.i, e.j) });
    }
    if (e.op === 'done') {
      for (const i of e.indices) done.add(i);
      steps.push({ ...base, sortedSet: [...done], note: text.done(e.indices.map((i) => `A[${i}]`).join(', ')) });
    }
  }
  const last = steps.at(-1);
  if (last) {
    const ok = isSorted(last.arr);
    steps.push({
      ...last,
      compare: undefined,
      write: undefined,
      sortedSet: ok ? last.arr.map((_, i) => i) : last.sortedSet,
      note: run.truncated ? text.truncated : ok ? text.sorted : text.unsorted,
    });
  }
  return steps;
}

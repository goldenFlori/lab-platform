import type { SortingText } from './sorting.text';

/* =====================================================================
 *  Sorting — Insertion, Selection, Merge.
 *  Counts COMPARISONS as the primary metric, exactly like Laboratori 3.
 * ===================================================================== */

export type SortAlgo = 'insertion' | 'selection' | 'merge';

export interface SortStep {
  note: string;
  arr: number[];
  compare?: number[];
  write?: number[];
  /** prefix [0..sortedTo] is in final position */
  sortedTo?: number;
  /** explicit set of finished indices (merge sort) */
  sortedSet?: number[];
  /** active range (merge sort) */
  range?: [number, number];
  comparisons: number;
  writes: number;
  line?: number;
}

/** Names and complexities; what each algorithm does is in sorting.text.ts, in both languages. */
export const SORT_META: Record<SortAlgo, { name: string; best: string; avg: string; worst: string }> = {
  insertion: {
    name: 'Insertion Sort',
    best: 'O(n)',
    avg: 'O(n²)',
    worst: 'O(n²)',
  },
  selection: {
    name: 'Selection Sort',
    best: 'O(n²)',
    avg: 'O(n²)',
    worst: 'O(n²)',
  },
  merge: {
    name: 'Merge Sort',
    best: 'O(n log n)',
    avg: 'O(n log n)',
    worst: 'O(n log n)',
  },
};

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

export function insertionSteps(src: number[], text: SortingText): SortStep[] {
  const T = text.insertion;
  const a = src.slice();
  const steps: SortStep[] = [];
  let c = 0,
    w = 0;
  steps.push({
    note: T.start,
    arr: a.slice(),
    sortedTo: 0,
    comparisons: c,
    writes: w,
    line: 0,
  });
  for (let i = 1; i < a.length; i++) {
    const v = a[i];
    let j = i - 1;
    steps.push({
      note: T.take(i, v),
      arr: a.slice(),
      compare: [i],
      sortedTo: i - 1,
      comparisons: c,
      writes: w,
      line: 1,
    });
    while (j >= 0) {
      c++;
      const bigger = a[j] > v;
      steps.push({
        note: T.compare(j, a[j], bigger, v),
        arr: a.slice(),
        compare: [j],
        sortedTo: i - 1,
        comparisons: c,
        writes: w,
        line: 2,
      });
      if (!bigger) break;
      a[j + 1] = a[j];
      w++;
      steps.push({
        note: T.shift(j, a[j]),
        arr: a.slice(),
        write: [j + 1],
        sortedTo: i - 1,
        comparisons: c,
        writes: w,
        line: 3,
      });
      j--;
    }
    a[j + 1] = v;
    w++;
    steps.push({
      note: T.place(v, j + 1, i),
      arr: a.slice(),
      write: [j + 1],
      sortedTo: i,
      comparisons: c,
      writes: w,
      line: 4,
    });
  }
  steps.push({
    note: T.done(c, w),
    arr: a.slice(),
    sortedTo: a.length - 1,
    comparisons: c,
    writes: w,
  });
  return steps;
}

export function selectionSteps(src: number[], text: SortingText): SortStep[] {
  const T = text.selection;
  const a = src.slice();
  const steps: SortStep[] = [];
  let c = 0,
    w = 0;
  steps.push({
    note: T.start,
    arr: a.slice(),
    sortedTo: -1,
    comparisons: c,
    writes: w,
    line: 0,
  });
  for (let i = 0; i < a.length - 1; i++) {
    let min = i;
    steps.push({
      note: T.candidate(i, a[i]),
      arr: a.slice(),
      compare: [i],
      sortedTo: i - 1,
      comparisons: c,
      writes: w,
      line: 1,
    });
    for (let j = i + 1; j < a.length; j++) {
      c++;
      const smaller = a[j] < a[min];
      if (smaller) min = j;
      steps.push({
        note: T.compare(j, a[j], smaller, min, a[min]),
        arr: a.slice(),
        compare: [j, min],
        sortedTo: i - 1,
        comparisons: c,
        writes: w,
        line: 3,
      });
    }
    if (min !== i) {
      [a[i], a[min]] = [a[min], a[i]];
      w += 2;
    }
    steps.push({
      note: min !== i ? T.swap(i, min) : T.stay(i),
      arr: a.slice(),
      write: min !== i ? [i, min] : [i],
      sortedTo: i,
      comparisons: c,
      writes: w,
      line: 4,
    });
  }
  const n = a.length;
  steps.push({
    note: T.done(c, (n * (n - 1)) / 2),
    arr: a.slice(),
    sortedTo: n - 1,
    comparisons: c,
    writes: w,
  });
  return steps;
}

export function mergeSteps(src: number[], text: SortingText): SortStep[] {
  const T = text.merge;
  const a = src.slice();
  const steps: SortStep[] = [];
  let c = 0,
    w = 0;
  steps.push({
    note: T.start,
    arr: a.slice(),
    sortedSet: [],
    comparisons: c,
    writes: w,
    line: 0,
  });
  const sort = (l: number, r: number) => {
    if (l >= r) return;
    const m = Math.floor((l + r) / 2);
    steps.push({
      note: T.split(l, m, r),
      arr: a.slice(),
      range: [l, r],
      sortedSet: [],
      comparisons: c,
      writes: w,
      line: 2,
    });
    sort(l, m);
    sort(m + 1, r);
    const left = a.slice(l, m + 1),
      right = a.slice(m + 1, r + 1);
    let i = 0,
      j = 0,
      k = l;
    steps.push({
      note: T.combine(left.join(', '), right.join(', ')),
      arr: a.slice(),
      range: [l, r],
      sortedSet: [],
      comparisons: c,
      writes: w,
      line: 4,
    });
    while (i < left.length && j < right.length) {
      c++;
      const takeLeft = left[i] <= right[j];
      steps.push({
        note: T.compare(left[i], takeLeft, right[j]),
        arr: a.slice(),
        compare: [k],
        range: [l, r],
        sortedSet: range(l, k - 1),
        comparisons: c,
        writes: w,
        line: 4,
      });
      a[k++] = takeLeft ? left[i++] : right[j++];
      w++;
    }
    while (i < left.length) {
      a[k++] = left[i++];
      w++;
    }
    while (j < right.length) {
      a[k++] = right[j++];
      w++;
    }
    steps.push({
      note: T.sorted(l, r, a.slice(l, r + 1).join(', ')),
      arr: a.slice(),
      range: [l, r],
      sortedSet: range(l, r),
      comparisons: c,
      writes: w,
      line: 4,
    });
  };
  sort(0, a.length - 1);
  const n = a.length;
  steps.push({
    note: T.done(c, Math.round(n * Math.log2(Math.max(n, 2)))),
    arr: a.slice(),
    sortedSet: range(0, n - 1),
    comparisons: c,
    writes: w,
  });
  return steps;
}

export const SORT_RUN: Record<SortAlgo, (a: number[], text: SortingText) => SortStep[]> = {
  insertion: insertionSteps,
  selection: selectionSteps,
  merge: mergeSteps,
};

/** Comparisons only — fast enough for growth curves up to n in the thousands. */
export function countComparisons(algo: SortAlgo, src: number[]): number {
  const a = src.slice();
  let c = 0;
  if (algo === 'insertion') {
    for (let i = 1; i < a.length; i++) {
      const v = a[i];
      let j = i - 1;
      while (j >= 0) {
        c++;
        if (a[j] <= v) break;
        a[j + 1] = a[j];
        j--;
      }
      a[j + 1] = v;
    }
  } else if (algo === 'selection') {
    for (let i = 0; i < a.length - 1; i++) {
      let m = i;
      for (let j = i + 1; j < a.length; j++) {
        c++;
        if (a[j] < a[m]) m = j;
      }
      [a[i], a[m]] = [a[m], a[i]];
    }
  } else {
    const ms = (l: number, r: number) => {
      if (l >= r) return;
      const m = (l + r) >> 1;
      ms(l, m);
      ms(m + 1, r);
      const L = a.slice(l, m + 1),
        R = a.slice(m + 1, r + 1);
      let i = 0,
        j = 0,
        k = l;
      while (i < L.length && j < R.length) {
        c++;
        a[k++] = L[i] <= R[j] ? L[i++] : R[j++];
      }
      while (i < L.length) a[k++] = L[i++];
      while (j < R.length) a[k++] = R[j++];
    };
    ms(0, a.length - 1);
  }
  return c;
}

/* ---------------------------------------------------------------- inputs */

/** Deterministic PRNG so server render and first client render agree. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

export type Case = 'random' | 'sorted' | 'reversed' | 'nearly';

export function makeInput(n: number, kind: Case, seed = 7): number[] {
  const r = rng(seed);
  const base = Array.from({ length: n }, (_, i) => i + 1);
  if (kind === 'sorted') return base;
  if (kind === 'reversed') return base.reverse();
  const a = base.slice();
  if (kind === 'nearly') {
    for (let k = 0; k < Math.max(1, Math.floor(n / 8)); k++) {
      const i = Math.floor(r() * (n - 1));
      [a[i], a[i + 1]] = [a[i + 1], a[i]];
    }
    return a;
  }
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function parseNumbers(
  text: string,
  T: SortingText['parse'],
  max = 24,
): { values: number[]; error: string | null } {
  const parts = text.split(/[^0-9.-]+/).filter(Boolean);
  if (!parts.length) return { values: [], error: T.empty };
  const values = parts.map(Number);
  if (values.some((v) => !Number.isFinite(v))) return { values: [], error: T.notNumbers };
  if (values.length < 2) return { values: [], error: T.tooFew };
  if (values.length > max) return { values: values.slice(0, max), error: T.tooMany(max) };
  return { values, error: null };
}

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

export const SORT_META: Record<
  SortAlgo,
  { name: string; best: string; avg: string; worst: string; idea: string; pseudo: string[] }
> = {
  insertion: {
    name: 'Insertion Sort',
    best: 'O(n)',
    avg: 'O(n²)',
    worst: 'O(n²)',
    idea: 'Fut çdo element në pozicionin e duhur në pjesën e renditur — si të renditësh letrat në dorë.',
    pseudo: [
      'for i ⟵ 1, …, n−1:',
      '    aktual = A[i];  j = i − 1',
      '    while j ≥ 0 and A[j] > aktual:',
      '        A[j+1] = A[j];  j = j − 1',
      '    A[j+1] = aktual',
    ],
  },
  selection: {
    name: 'Selection Sort',
    best: 'O(n²)',
    avg: 'O(n²)',
    worst: 'O(n²)',
    idea: 'Në çdo hap gjen elementin më të vogël të pjesës së parenditur dhe e vendos në fund të pjesës së renditur.',
    pseudo: [
      'for i ⟵ 0, …, n−2:',
      '    min = i',
      '    for j ⟵ i+1, …, n−1:',
      '        if A[j] < A[min]:  min = j',
      '    këmbe A[i] me A[min]',
    ],
  },
  merge: {
    name: 'Merge Sort',
    best: 'O(n log n)',
    avg: 'O(n log n)',
    worst: 'O(n log n)',
    idea: 'Përça e sundo: ndaj listën përgjysmë, rendit secilën gjysmë rekursivisht, pastaj bashko (Merge) dy gjysmat e renditura.',
    pseudo: [
      'MergeSort(A):',
      '    if len(A) ≤ 1: return A',
      '    L = MergeSort(gjysma e majtë)',
      '    R = MergeSort(gjysma e djathtë)',
      '    return Merge(L, R)',
    ],
  },
};

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

export function insertionSteps(src: number[]): SortStep[] {
  const a = src.slice();
  const steps: SortStep[] = [];
  let c = 0,
    w = 0;
  steps.push({
    note: 'Fillimi. Elementi i parë, A[0], formon vetë një listë të renditur.',
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
      note: `Marrim **aktual = A[${i}] = ${v}** dhe e fusim në pjesën e renditur A[0…${i - 1}].`,
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
        note: `Krahasim: A[${j}] = ${a[j]} ${bigger ? '>' : '≤'} ${v}. ${bigger ? 'Spostojmë djathtas.' : 'Vendi u gjet — cikli `while` ndalon.'}`,
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
        note: `A[${j}] = ${a[j]} spostohet në pozicionin ${j + 1}.`,
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
      note: `${v} vendoset në pozicionin ${j + 1}. Tani **A[0…${i}] është e renditur** — hipoteza e induksionit vlen pas iteracionit ${i}.`,
      arr: a.slice(),
      write: [j + 1],
      sortedTo: i,
      comparisons: c,
      writes: w,
      line: 4,
    });
  }
  steps.push({
    note: `Përfundoi: **${c} krahasime**, ${w} shkrime.`,
    arr: a.slice(),
    sortedTo: a.length - 1,
    comparisons: c,
    writes: w,
  });
  return steps;
}

export function selectionSteps(src: number[]): SortStep[] {
  const a = src.slice();
  const steps: SortStep[] = [];
  let c = 0,
    w = 0;
  steps.push({
    note: 'Fillimi. Asnjë element nuk është ende në pozicionin final.',
    arr: a.slice(),
    sortedTo: -1,
    comparisons: c,
    writes: w,
    line: 0,
  });
  for (let i = 0; i < a.length - 1; i++) {
    let min = i;
    steps.push({
      note: `Kandidati fillestar për minimum: A[${i}] = ${a[i]}.`,
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
        note: `Krahasim: A[${j}] = ${a[j]} ${smaller ? '<' : '≥'} minimumi aktual. ${smaller ? `Minimumi i ri: A[${min}] = ${a[min]}.` : 'Minimumi nuk ndryshon.'}`,
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
      note:
        min !== i
          ? `Këmbejmë A[${i}] me A[${min}]. **Pozicioni ${i} është final.**`
          : `A[${i}] ishte tashmë minimumi. **Pozicioni ${i} është final.**`,
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
    note: `Përfundoi: **${c} krahasime** — gjithmonë saktësisht n(n−1)/2 = ${(n * (n - 1)) / 2}, për çdo input.`,
    arr: a.slice(),
    sortedTo: n - 1,
    comparisons: c,
    writes: w,
  });
  return steps;
}

export function mergeSteps(src: number[]): SortStep[] {
  const a = src.slice();
  const steps: SortStep[] = [];
  let c = 0,
    w = 0;
  steps.push({
    note: 'Fillimi. Merge Sort e ndan listën përgjysmë në mënyrë rekursive, derisa çdo pjesë ka një element.',
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
      note: `PËRÇA: [${l}…${r}] → [${l}…${m}] dhe [${m + 1}…${r}].`,
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
      note: `KOMBINO: Merge([${left.join(', ')}], [${right.join(', ')}]).`,
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
        note: `Krahasim: ${left[i]} ${takeLeft ? '≤' : '>'} ${right[j]} → marrim ${takeLeft ? left[i] : right[j]}.`,
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
      note: `Segmenti [${l}…${r}] është i renditur: [${a.slice(l, r + 1).join(', ')}].`,
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
    note: `Përfundoi: **${c} krahasime** — afër n·log₂n = ${Math.round(n * Math.log2(Math.max(n, 2)))}.`,
    arr: a.slice(),
    sortedSet: range(0, n - 1),
    comparisons: c,
    writes: w,
  });
  return steps;
}

export const SORT_RUN: Record<SortAlgo, (a: number[]) => SortStep[]> = {
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

export function parseNumbers(text: string, max = 24): { values: number[]; error: string | null } {
  const parts = text.split(/[^0-9.-]+/).filter(Boolean);
  if (!parts.length) return { values: [], error: 'Shkruani të paktën dy numra.' };
  const values = parts.map(Number);
  if (values.some((v) => !Number.isFinite(v)))
    return { values: [], error: 'Përdorni vetëm numra, të ndarë me presje.' };
  if (values.length < 2) return { values: [], error: 'Duhen të paktën dy numra.' };
  if (values.length > max) return { values: values.slice(0, max), error: `U morën vetëm ${max} numrat e parë.` };
  return { values, error: null };
}

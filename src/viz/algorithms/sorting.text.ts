import { bilingual } from '../kit/text';
import type { SortAlgo } from './sorting';

// What the sorting steps say (#19). The pseudocode follows the lecture's; only its words change.

type Meta = Record<SortAlgo, { idea: string; pseudo: string[] }>;

const sq = {
  meta: {
    insertion: {
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
      idea: 'Përça e sundo: ndaj listën përgjysmë, rendit secilën gjysmë rekursivisht, pastaj bashko (Merge) dy gjysmat e renditura.',
      pseudo: [
        'MergeSort(A):',
        '    if len(A) ≤ 1: return A',
        '    L = MergeSort(gjysma e majtë)',
        '    R = MergeSort(gjysma e djathtë)',
        '    return Merge(L, R)',
      ],
    },
  } as Meta,
  insertion: {
    start: 'Fillimi. Elementi i parë, A[0], formon vetë një listë të renditur.',
    take: (i: number, v: number) =>
      `Marrim **aktual = A[${i}] = ${v}** dhe e fusim në pjesën e renditur A[0…${i - 1}].`,
    compare: (j: number, aj: number, bigger: boolean, v: number) =>
      `Krahasim: A[${j}] = ${aj} ${bigger ? '>' : '≤'} ${v}. ${bigger ? 'Spostojmë djathtas.' : 'Vendi u gjet — cikli `while` ndalon.'}`,
    shift: (j: number, aj: number) => `A[${j}] = ${aj} spostohet në pozicionin ${j + 1}.`,
    place: (v: number, at: number, i: number) =>
      `${v} vendoset në pozicionin ${at}. Tani **A[0…${i}] është e renditur** — hipoteza e induksionit vlen pas iteracionit ${i}.`,
    done: (c: number, w: number) => `Përfundoi: **${c} krahasime**, ${w} shkrime.`,
  },
  selection: {
    start: 'Fillimi. Asnjë element nuk është ende në pozicionin final.',
    candidate: (i: number, ai: number) => `Kandidati fillestar për minimum: A[${i}] = ${ai}.`,
    compare: (j: number, aj: number, smaller: boolean, min: number, amin: number) =>
      `Krahasim: A[${j}] = ${aj} ${smaller ? '<' : '≥'} minimumi aktual. ${smaller ? `Minimumi i ri: A[${min}] = ${amin}.` : 'Minimumi nuk ndryshon.'}`,
    swap: (i: number, min: number) => `Këmbejmë A[${i}] me A[${min}]. **Pozicioni ${i} është final.**`,
    stay: (i: number) => `A[${i}] ishte tashmë minimumi. **Pozicioni ${i} është final.**`,
    done: (c: number, total: number) =>
      `Përfundoi: **${c} krahasime** — gjithmonë saktësisht n(n−1)/2 = ${total}, për çdo input.`,
  },
  merge: {
    start: 'Fillimi. Merge Sort e ndan listën përgjysmë në mënyrë rekursive, derisa çdo pjesë ka një element.',
    split: (l: number, m: number, r: number) => `PËRÇA: [${l}…${r}] → [${l}…${m}] dhe [${m + 1}…${r}].`,
    combine: (left: string, right: string) => `KOMBINO: Merge([${left}], [${right}]).`,
    compare: (x: number, takeLeft: boolean, y: number) =>
      `Krahasim: ${x} ${takeLeft ? '≤' : '>'} ${y} → marrim ${takeLeft ? x : y}.`,
    sorted: (l: number, r: number, values: string) => `Segmenti [${l}…${r}] është i renditur: [${values}].`,
    done: (c: number, nlogn: number) => `Përfundoi: **${c} krahasime** — afër n·log₂n = ${nlogn}.`,
  },
  parse: {
    empty: 'Shkruani të paktën dy numra.',
    notNumbers: 'Përdorni vetëm numra, të ndarë me presje.',
    tooFew: 'Duhen të paktën dy numra.',
    tooMany: (max: number) => `U morën vetëm ${max} numrat e parë.`,
  },
};

export type SortingText = typeof sq;

export const SORTING_TEXT = bilingual<SortingText>(sq, {
  meta: {
    insertion: {
      idea: 'Put each element in its right place in the sorted part — like sorting the cards in your hand.',
      pseudo: [
        'for i ⟵ 1, …, n−1:',
        '    current = A[i];  j = i − 1',
        '    while j ≥ 0 and A[j] > current:',
        '        A[j+1] = A[j];  j = j − 1',
        '    A[j+1] = current',
      ],
    },
    selection: {
      idea: 'At each step, find the smallest element of the unsorted part and put it at the end of the sorted part.',
      pseudo: [
        'for i ⟵ 0, …, n−2:',
        '    min = i',
        '    for j ⟵ i+1, …, n−1:',
        '        if A[j] < A[min]:  min = j',
        '    swap A[i] with A[min]',
      ],
    },
    merge: {
      idea: 'Divide and conquer: split the list in half, sort each half recursively, then merge the two sorted halves.',
      pseudo: [
        'MergeSort(A):',
        '    if len(A) ≤ 1: return A',
        '    L = MergeSort(left half)',
        '    R = MergeSort(right half)',
        '    return Merge(L, R)',
      ],
    },
  },
  insertion: {
    start: 'Start. The first element, A[0], is a sorted list on its own.',
    take: (i, v) => `Take **current = A[${i}] = ${v}** and insert it into the sorted part A[0…${i - 1}].`,
    compare: (j, aj, bigger, v) =>
      `Compare: A[${j}] = ${aj} ${bigger ? '>' : '≤'} ${v}. ${bigger ? 'Shift it right.' : 'The place is found — the `while` loop stops.'}`,
    shift: (j, aj) => `A[${j}] = ${aj} moves to position ${j + 1}.`,
    place: (v, at, i) =>
      `${v} goes to position ${at}. Now **A[0…${i}] is sorted** — the induction hypothesis holds after iteration ${i}.`,
    done: (c, w) => `Done: **${c} comparisons**, ${w} writes.`,
  },
  selection: {
    start: 'Start. No element is in its final position yet.',
    candidate: (i, ai) => `First candidate for the minimum: A[${i}] = ${ai}.`,
    compare: (j, aj, smaller, min, amin) =>
      `Compare: A[${j}] = ${aj} ${smaller ? '<' : '≥'} the current minimum. ${smaller ? `New minimum: A[${min}] = ${amin}.` : 'The minimum does not change.'}`,
    swap: (i, min) => `Swap A[${i}] with A[${min}]. **Position ${i} is final.**`,
    stay: (i) => `A[${i}] was already the minimum. **Position ${i} is final.**`,
    done: (c, total) => `Done: **${c} comparisons** — always exactly n(n−1)/2 = ${total}, for any input.`,
  },
  merge: {
    start: 'Start. Merge Sort splits the list in half recursively, until every part has one element.',
    split: (l, m, r) => `DIVIDE: [${l}…${r}] → [${l}…${m}] and [${m + 1}…${r}].`,
    combine: (left, right) => `COMBINE: Merge([${left}], [${right}]).`,
    compare: (x, takeLeft, y) => `Compare: ${x} ${takeLeft ? '≤' : '>'} ${y} → take ${takeLeft ? x : y}.`,
    sorted: (l, r, values) => `The segment [${l}…${r}] is sorted: [${values}].`,
    done: (c, nlogn) => `Done: **${c} comparisons** — close to n·log₂n = ${nlogn}.`,
  },
  parse: {
    empty: 'Enter at least two numbers.',
    notNumbers: 'Use numbers only, separated by commas.',
    tooFew: 'At least two numbers are needed.',
    tooMany: (max) => `Only the first ${max} numbers were taken.`,
  },
});

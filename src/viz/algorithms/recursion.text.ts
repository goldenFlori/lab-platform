import { bilingual } from '../kit/text';

// What the recursion-tree steps say (#133), in both languages.

const sq = {
  merge: {
    call: (part: string) => `Thirrje: **mergeSort(${part})** — e ndajmë në dy gjysma.`,
    base: (part: string) => `**${part}** ka një element: rasti bazë, është tashmë e renditur.`,
    merged: (left: string, right: string, out: string, cmp: number) =>
      `Bashkojmë ${left} dhe ${right} → **${out}** (${cmp} krahasime).`,
    done: (n: number, levels: number, total: number) =>
      `Gati! Çdo nivel bën rreth n = ${n} punë, dhe ka log₂n = ${levels} nivele bashkimi: rreth n·log₂n = ${n * levels}. Krahasime gjithsej: **${total}**.`,
  },
  fib: {
    call: (k: number) => `Thirrje: **fib(${k})**.`,
    repeat: (k: number, times: number) => `**fib(${k})** po llogaritet sërish — hera e ${times}-të. Punë e përsëritur!`,
    memo: (k: number, v: number) => `**fib(${k})** është në kujtesë: kthehet ${v} menjëherë, pa thirrje të reja.`,
    base: (k: number) => `**fib(${k}) = ${k}**: rasti bazë.`,
    ret: (k: number, a: number, b: number, v: number) => `fib(${k}) = ${a} + ${b} = **${v}**.`,
    done: (n: number, v: number, calls: number) => `fib(${n}) = **${v}**, me **${calls}** thirrje gjithsej.`,
  },
};

export type RecursionText = typeof sq;

export const RECURSION_TEXT = bilingual<RecursionText>(sq, {
  merge: {
    call: (part) => `Call: **mergeSort(${part})** — split it into two halves.`,
    base: (part) => `**${part}** has one element: the base case, already sorted.`,
    merged: (left, right, out, cmp) => `Merge ${left} and ${right} → **${out}** (${cmp} comparisons).`,
    done: (n, levels, total) =>
      `Done! Each level does about n = ${n} work, and there are log₂n = ${levels} merge levels: about n·log₂n = ${n * levels}. Comparisons in all: **${total}**.`,
  },
  fib: {
    call: (k) => `Call: **fib(${k})**.`,
    repeat: (k, times) => `**fib(${k})** is computed again — time number ${times}. Repeated work!`,
    memo: (k, v) => `**fib(${k})** is in the memo: it returns ${v} at once, with no new calls.`,
    base: (k) => `**fib(${k}) = ${k}**: the base case.`,
    ret: (k, a, b, v) => `fib(${k}) = ${a} + ${b} = **${v}**.`,
    done: (n, v, calls) => `fib(${n}) = **${v}**, with **${calls}** calls in all.`,
  },
});

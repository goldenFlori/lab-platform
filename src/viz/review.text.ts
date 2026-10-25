import { bilingual } from './kit/text';

// The review session's words (#152).

const sq = {
  progress: (n: number, of: number) => `Pyetja ${n} nga ${of}`,
  next: 'Vazhdo',
  finish: 'Shiko rezultatin',
  again: 'Një sesion tjetër',
  right: 'Saktë!',
  wrong: (answer: string) => `Jo — përgjigjja është ${answer}.`,
  queue: 'Radha (FIFO), përpara majtas',
  stack: 'Stiva (LIFO), maja djathtas',
  left: 'Mbetet nga e majta',
  right_: 'Mbetet nga e djathta',
  written: 'Shkruar deri tani',
  sorted: 'pjesa e renditur',
  doneTitle: 'Sesioni mbaroi',
  score: (right: number, of: number) => `${right} nga ${of} të sakta`,
  revisit: 'Për ta përsëritur',
  allRight: 'Të gjitha të sakta. Provoni një sesion tjetër me të dhëna të reja.',
  matrix: (k: string) => `D para krahasimit, k = ${k}`,
};

export type ReviewText = typeof sq;

export const REVIEW_TEXT = bilingual<ReviewText>(sq, {
  progress: (n, of) => `Question ${n} of ${of}`,
  next: 'Continue',
  finish: 'See the result',
  again: 'Another session',
  right: 'Right!',
  wrong: (answer) => `No — the answer is ${answer}.`,
  queue: 'Queue (FIFO), front on the left',
  stack: 'Stack (LIFO), top on the right',
  left: 'Left of the left half',
  right_: 'Left of the right half',
  written: 'Written so far',
  sorted: 'the sorted part',
  doneTitle: 'Session done',
  score: (right, of) => `${right} of ${of} right`,
  revisit: 'To review',
  allRight: 'All right. Try another session with new inputs.',
  matrix: (k) => `D before the comparison, k = ${k}`,
});

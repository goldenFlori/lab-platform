import { bilingual } from '../kit/text';

// What predict mode says (#127): the questions at each decision, and why the answer is right.

const sq = {
  mode: 'Parashiko',
  help: 'Algoritmi ndalet te çdo vendim: zgjidhni hapin tjetër para se ta shihni.',
  score: (right: number, asked: number) => `${right}/${asked} parashikime të sakta`,
  right: 'Saktë!',
  wrong: (answer: string) => `Jo — përgjigjja është ${answer}.`,
  choose: 'Zgjidhni përgjigjen për të vazhduar.',
  bfs: {
    prompt: 'Cili kulm del tani nga radha?',
    explain: (v: string) => `Radha është FIFO: del kulmi që hyri i pari — **${v}**.`,
  },
  dfs: {
    prompt: 'Cili kulm del tani nga stiva?',
    explain: (v: string) => `Stiva është LIFO: del kulmi në majë, ai që hyri i fundit — **${v}**.`,
  },
  dijkstra: {
    prompt: 'Cilin kulm zgjedh Dijkstra tani?',
    explain: (v: string, d: string, tie: boolean) =>
      `Dijkstra zgjedh kulmin e pazgjedhur me distancën më të vogël: **${v}** (${d}).${tie ? ' Ka barazim: çdo kulm me këtë distancë është i saktë; kodi merr të parin sipas rendit.' : ''}`,
  },
  selection: {
    prompt: (i: number) => `Cili element do të përfundojë në pozicionin ${i}?`,
    explain: (v: number) => `Selection Sort vendos këtu minimumin e pjesës ende të parenditur: **${v}**.`,
  },
};

export type PredictText = typeof sq;

export const PREDICT_TEXT = bilingual<PredictText>(sq, {
  mode: 'Predict',
  help: 'The algorithm stops at every decision: choose the next step before you see it.',
  score: (right, asked) => `${right}/${asked} predictions right`,
  right: 'Right!',
  wrong: (answer) => `No — the answer is ${answer}.`,
  choose: 'Choose an answer to continue.',
  bfs: {
    prompt: 'Which vertex leaves the queue now?',
    explain: (v) => `A queue is FIFO: the vertex that came in first leaves first — **${v}**.`,
  },
  dfs: {
    prompt: 'Which vertex leaves the stack now?',
    explain: (v) => `A stack is LIFO: the vertex on top, the last one pushed, leaves first — **${v}**.`,
  },
  dijkstra: {
    prompt: 'Which vertex does Dijkstra choose now?',
    explain: (v, d, tie) =>
      `Dijkstra chooses the unsettled vertex with the smallest distance: **${v}** (${d}).${tie ? ' There is a tie: any vertex with this distance is right; the code takes the first in order.' : ''}`,
  },
  selection: {
    prompt: (i) => `Which element will end up in position ${i}?`,
    explain: (v) => `Selection Sort puts here the minimum of the part not yet sorted: **${v}**.`,
  },
});

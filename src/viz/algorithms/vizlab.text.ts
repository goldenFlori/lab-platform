import { bilingual } from '../kit/text';
import type { VizlabText } from './vizlab';

// What a student's visualized run says (#69).

export const VIZLAB_TEXT = bilingual<VizlabText>(
  {
    start: (arr: number[]) => `Lista juaj në fillim: [${arr.join(', ')}].`,
    compare: (i: number, a: number, j: number, b: number) => `Krahasohen A[${i}] = ${a} dhe A[${j}] = ${b}.`,
    write: (i: number, v: number) => `A[${i}] merr vlerën ${v}.`,
    swap: (i: number, j: number) => `Shkëmbehen A[${i}] dhe A[${j}].`,
    done: (list: string) => `Në pozicionin final: ${list}.`,
    sorted: 'Mbaroi: lista juaj është e renditur ✓',
    unsorted: 'Mbaroi, por lista nuk është e renditur: kontrolloni kodin.',
    truncated: 'Kodi bëri shumë hapa; shfaqen vetëm të parët.',
  },
  {
    start: (arr) => `Your list at the start: [${arr.join(', ')}].`,
    compare: (i, a, j, b) => `A[${i}] = ${a} and A[${j}] = ${b} are compared.`,
    write: (i, v) => `A[${i}] takes the value ${v}.`,
    swap: (i, j) => `A[${i}] and A[${j}] are swapped.`,
    done: (list) => `In its final position: ${list}.`,
    sorted: 'Done: your list is sorted ✓',
    unsorted: 'Done, but the list is not sorted: check your code.',
    truncated: 'The code took very many steps; only the first are shown.',
  },
);

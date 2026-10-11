import { bilingual } from '../kit/text';
import type { VizlabText } from './vizlab';
import type { VizlabGraphText } from './vizlab-graph';

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

/** What a student's visualized graph traversal says (#70). */
export const VIZLAB_GRAPH_TEXT = bilingual<VizlabGraphText>(
  {
    start: (node) => `Grafi juaj. Kulmi i parë në listë: ${node}.`,
    visit: (node, n) => `Vizitohet ${node} (i ${n}-ti).`,
    relax: (u, v, d) => `Relaksohet ${u} → ${v}: d(${v}) = ${d}.`,
    tree: (u, v) => `Brinja ${u}–${v} hyn në pemë.`,
    seen: (u, v) => `Shqyrtohet brinja ${u}–${v}.`,
    done: (order) => `Mbaroi. Rendi i vizitës: ${order}.`,
    noVisits: 'Kodi nuk thirri vizlab.visit(): nuk ka vizita për të shfaqur.',
    truncated: 'Kodi bëri shumë hapa; shfaqen vetëm të parët.',
  },
  {
    start: (node) => `Your graph. The first vertex listed: ${node}.`,
    visit: (node, n) => `${node} is visited (#${n}).`,
    relax: (u, v, d) => `${u} → ${v} is relaxed: d(${v}) = ${d}.`,
    tree: (u, v) => `Edge ${u}–${v} joins the tree.`,
    seen: (u, v) => `Edge ${u}–${v} is looked at.`,
    done: (order) => `Done. The order of visits: ${order}.`,
    noVisits: 'The code did not call vizlab.visit(): there are no visits to show.',
    truncated: 'The code took very many steps; only the first are shown.',
  },
);

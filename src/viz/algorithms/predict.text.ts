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
  insertion: {
    prompt: (v: number, i: number) => `Merret ${v} (indeksi ${i}). Në cilin indeks do të përfundojë?`,
    explain: (v: number, at: number, shifted: number) =>
      `${v} shkon në indeksin **${at}**: vlerat ≤ ${v} (${at}) mbeten para tij, dhe vlerat më të mëdha (${shifted}) zhvendosen një vend djathtas.`,
  },
  merge: {
    prompt: (pos: number) => `Gjatë bashkimit: cila vlerë shkruhet në pozicionin ${pos}?`,
    left: (v: number) => `${v} · nga e majta`,
    right: (v: number) => `${v} · nga e djathta`,
    explain: (a: number, b: number, v: number) =>
      `Bashkimi krahason kokat e dy gjysmave, ${a} dhe ${b}, dhe shkruan më të voglën: **${v}**.`,
  },
  keep: (d: string) => `mbetet ${d}`,
  update: (d: string) => `bëhet ${d}`,
  bellman: {
    prompt: (u: string, v: string, w: number) => `Relaksohet brinja ${u}→${v} (pesha ${w}). Çfarë bëhet dist[${v}]?`,
    explain: (u: string, v: string, du: string, w: number, cand: string, old: string, better: boolean) =>
      better
        ? `dist[${u}] + ${w} = ${du} + (${w}) = ${cand} < ${old}: rruga përmes ${u} është më e shkurtër, prandaj dist[${v}] **bëhet ${cand}**.`
        : `dist[${u}] + ${w} = ${du} + (${w}) = ${cand} ≥ ${old}: nuk e përmirëson, prandaj dist[${v}] **mbetet ${old}**.`,
  },
  kruskal: {
    prompt: (e: string) => `Kruskal: brinja tjetër sipas peshës është ${e}. Çfarë bëhet me të?`,
    accept: 'pranohet',
    reject: 'refuzohet',
    explainAccept: (u: string, v: string) =>
      `${u} dhe ${v} janë në pjesë të ndryshme të pyllit, prandaj brinja nuk mbyll cikël: **pranohet**.`,
    explainReject: (u: string, v: string) =>
      `${u} dhe ${v} janë tashmë të lidhur nga brinjët e zgjedhura, prandaj brinja do të mbyllte një cikël: **refuzohet**.`,
  },
  prim: {
    prompt: (tree: string) => `Prim: pema ka {${tree}}. Cila brinjë hyn tani në pemë?`,
    explain: (e: string, tie: boolean) =>
      `Prim merr brinjën më të lehtë që kalon prerjen (një skaj në pemë, tjetri jashtë): **${e}**.${tie ? ' Ka barazim: çdo brinjë me këtë peshë është e saktë.' : ''}`,
  },
  flow: {
    prompt: (path: string) => `Rruga rritëse: ${path}. Sa është ngushtica?`,
    explain: (caps: string, x: number) =>
      `Ngushtica është kapaciteti mbetës më i vogël përgjatë rrugës (${caps}): **${x}**. Aq rrjedhë mund të shtohet.`,
  },
  topo: {
    help: 'Kulmet që mund të vijnë tani nuk ndriçohen më: zgjidhni vetë.',
    right: (v: string) => `Saktë: të gjitha parakushtet e ${v} janë vendosur (fuqia hyrëse e mbetur 0).`,
  },
  floyd: {
    prompt: (i: string, j: string, k: string) => `k = ${k}: çfarë bëhet D[${i}][${j}]?`,
    explain: (
      i: string,
      j: string,
      k: string,
      ik: string,
      kj: string,
      through: string,
      old: string,
      better: boolean,
    ) =>
      better
        ? `D[${i}][${k}] + D[${k}][${j}] = ${ik} + ${kj} = ${through} < ${old}: kalimi përmes ${k} e shkurton rrugën, prandaj D[${i}][${j}] **bëhet ${through}**.`
        : `D[${i}][${k}] + D[${k}][${j}] = ${ik} + ${kj} = ${through} ≥ ${old}: kalimi përmes ${k} nuk ndihmon, prandaj D[${i}][${j}] **mbetet ${old}**.`,
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
  insertion: {
    prompt: (v, i) => `${v} (index ${i}) is taken. At which index will it end up?`,
    explain: (v, at, shifted) =>
      `${v} goes to index **${at}**: the values ≤ ${v} (${at}) stay before it, and the larger ones (${shifted}) shift one place right.`,
  },
  merge: {
    prompt: (pos) => `While merging: which value is written to position ${pos}?`,
    left: (v) => `${v} · from the left`,
    right: (v) => `${v} · from the right`,
    explain: (a, b, v) =>
      `The merge compares the heads of the two halves, ${a} and ${b}, and writes the smaller: **${v}**.`,
  },
  keep: (d) => `stays ${d}`,
  update: (d) => `becomes ${d}`,
  bellman: {
    prompt: (u, v, w) => `Edge ${u}→${v} (weight ${w}) is relaxed. What does dist[${v}] become?`,
    explain: (u, v, du, w, cand, old, better) =>
      better
        ? `dist[${u}] + ${w} = ${du} + (${w}) = ${cand} < ${old}: the path through ${u} is shorter, so dist[${v}] **becomes ${cand}**.`
        : `dist[${u}] + ${w} = ${du} + (${w}) = ${cand} ≥ ${old}: no improvement, so dist[${v}] **stays ${old}**.`,
  },
  kruskal: {
    prompt: (e) => `Kruskal: the next edge by weight is ${e}. What happens to it?`,
    accept: 'accepted',
    reject: 'rejected',
    explainAccept: (u, v) =>
      `${u} and ${v} are in different parts of the forest, so the edge closes no cycle: **accepted**.`,
    explainReject: (u, v) =>
      `${u} and ${v} are already joined by the chosen edges, so the edge would close a cycle: **rejected**.`,
  },
  prim: {
    prompt: (tree) => `Prim: the tree has {${tree}}. Which edge joins the tree now?`,
    explain: (e, tie) =>
      `Prim takes the lightest edge crossing the cut (one end in the tree, the other outside): **${e}**.${tie ? ' There is a tie: any edge of this weight is right.' : ''}`,
  },
  flow: {
    prompt: (path) => `Augmenting path: ${path}. What is its bottleneck?`,
    explain: (caps, x) =>
      `The bottleneck is the smallest residual capacity along the path (${caps}): **${x}**. That much flow can be added.`,
  },
  topo: {
    help: 'The vertices that may come next are no longer highlighted: choose yourself.',
    right: (v) => `Right: every prerequisite of ${v} is placed (its remaining in-degree is 0).`,
  },
  floyd: {
    prompt: (i, j, k) => `k = ${k}: what does D[${i}][${j}] become?`,
    explain: (i, j, k, ik, kj, through, old, better) =>
      better
        ? `D[${i}][${k}] + D[${k}][${j}] = ${ik} + ${kj} = ${through} < ${old}: going through ${k} is shorter, so D[${i}][${j}] **becomes ${through}**.`
        : `D[${i}][${k}] + D[${k}][${j}] = ${ik} + ${kj} = ${through} ≥ ${old}: going through ${k} does not help, so D[${i}][${j}] **stays ${old}**.`,
  },
});

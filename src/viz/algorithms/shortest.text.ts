import { bilingual } from '../kit/text';

// What the shortest-path steps say (#19). Numbers arrive already written (∞ for infinity).

const sq = {
  dijkstra: {
    startNegative: (src: string) =>
      `Inicializim: dist[${src}] = 0, të tjerat ∞. **Kujdes:** ka peshë negative — kushti i Dijkstra-s (w ≥ 0) është shkelur.`,
    start: (src: string) => `Inicializim: dist[${src}] = 0, të gjitha të tjerat ∞.`,
    unreachable: 'Kulmet e mbetura janë të paarritshme nga burimi. Algoritmi ndalet.',
    pick: (u: string, d: string) =>
      `Zgjedhim kulmin e patabeluar me distancë minimale: **${u}** (dist = ${d}). Ky vendim është përfundimtar.`,
    relax: (u: string, v: string, w: number, du: string, cand: string, better: boolean, old: string, newDist: number) =>
      `Relaksim ${u}→${v} (w = ${w}): ${du} + ${w} = ${cand} ${better ? '<' : '≥'} ${old}. ${better ? `**dist[${v}] = ${newDist}**, paraardhësi ${u}.` : 'Pa përmirësim.'}`,
    doneNegative:
      'Dijkstra mbaroi, por rezultati **mund të jetë i gabuar**: një kulm i tabeluar nuk rishikohet kurrë, ndërsa një brinjë negative më vonë mund ta shkurtonte rrugën. Përdorni Bellman-Ford.',
    done: (relax: number) => `Dijkstra mbaroi pas ${relax} relaksimesh. Çdo kulm u tabelua saktësisht një herë.`,
  },
  bellman: {
    start: (src: string, times: number) =>
      `Inicializim: dist[${src}] = 0. Bellman-Ford kalon nëpër **të gjitha brinjët** në çdo iterim, deri në |V| − 1 = ${times} herë.`,
    relax: (
      it: number,
      u: string,
      v: string,
      w: number,
      du: string,
      cand: string,
      better: boolean,
      old: string,
      newDist: number,
    ) =>
      `Iterimi ${it} · ${u}→${v} (w = ${w}): ${du} + ${w} = ${cand} ${better ? '<' : '≥'} ${old}. ${better ? `**dist[${v}] = ${newDist}**.` : 'Pa ndryshim.'}`,
    early: (it: number, times: number) =>
      `Iterimi ${it} nuk ndryshoi asnjë distancë → **ndalim i hershëm**, pa bërë të gjitha ${times} iterimet.`,
    negativeCycle: (times: number) =>
      `Kontrolli final: një brinjë ende relaksohet pas ${times} iterimesh → **cikël negativ**. Rruga më e shkurtër nuk ekziston.`,
    done: (relax: number) =>
      `Kontrolli final: asnjë brinjë nuk relaksohet më → **pa cikël negativ**. Distancat janë të sakta. Gjithsej ${relax} relaksime.`,
  },
  floyd: {
    start: 'Inicializim: **D⁰ = W** — pesha e harkut (i, j), ∞ kur s’ka hark, 0 në diagonale. P[i][j] = i kur ka hark.',
    k: (k: string) => `**k = ${k}**: provojmë ${k} si kulm ndërmjetës për çdo çift (i, j).`,
    compare: (
      i: string,
      j: string,
      k: string,
      old: string,
      dik: string,
      dkj: string,
      through: string,
      improved: boolean,
    ) =>
      `D[${i}][${j}] = min(${old}, D[${i}][${k}] + D[${k}][${j}] = ${dik} + ${dkj} = ${through})${improved ? ` → **${through}**: ${i} → ${k} → ${j} është më e shkurtër.` : ' → pa ndryshim.'}`,
    negativeCycle: 'D[v][v] < 0 për ndonjë kulm → **cikël negativ**.',
    done: (n: number, checks: number, updates: number) =>
      `Përfundoi: ${n}³ = ${checks} kontrolle, **${updates} përmirësime**. D mban distancat minimale për çdo çift.`,
  },
};

export type ShortestText = typeof sq;

export const SHORTEST_TEXT = bilingual<ShortestText>(sq, {
  dijkstra: {
    startNegative: (src) =>
      `Start: dist[${src}] = 0, all others ∞. **Careful:** there are negative weights — Dijkstra’s condition (w ≥ 0) is broken.`,
    start: (src) => `Start: dist[${src}] = 0, all others ∞.`,
    unreachable: 'The remaining vertices cannot be reached from the source. The algorithm stops.',
    pick: (u, d) =>
      `Pick the unsettled vertex with the smallest distance: **${u}** (dist = ${d}). This choice is final.`,
    relax: (u, v, w, du, cand, better, old, newDist) =>
      `Relax ${u}→${v} (w = ${w}): ${du} + ${w} = ${cand} ${better ? '<' : '≥'} ${old}. ${better ? `**dist[${v}] = ${newDist}**, predecessor ${u}.` : 'No improvement.'}`,
    doneNegative:
      'Dijkstra finished, but the result **may be wrong**: a settled vertex is never revisited, while a negative edge later could have shortened the path. Use Bellman-Ford.',
    done: (relax) => `Dijkstra finished after ${relax} relaxations. Every vertex was settled exactly once.`,
  },
  bellman: {
    start: (src, times) =>
      `Start: dist[${src}] = 0. Bellman-Ford goes through **every edge** in each iteration, up to |V| − 1 = ${times} times.`,
    relax: (it, u, v, w, du, cand, better, old, newDist) =>
      `Iteration ${it} · ${u}→${v} (w = ${w}): ${du} + ${w} = ${cand} ${better ? '<' : '≥'} ${old}. ${better ? `**dist[${v}] = ${newDist}**.` : 'No change.'}`,
    early: (it, times) =>
      `Iteration ${it} changed no distance → **early stop**, without doing all ${times} iterations.`,
    negativeCycle: (times) =>
      `Final check: an edge still relaxes after ${times} iterations → **negative cycle**. No shortest path exists.`,
    done: (relax) =>
      `Final check: no edge relaxes any more → **no negative cycle**. The distances are correct. ${relax} relaxations in all.`,
  },
  floyd: {
    start:
      'Start: **D⁰ = W** — the weight of edge (i, j), ∞ when there is none, 0 on the diagonal. P[i][j] = i when there is an edge.',
    k: (k) => `**k = ${k}**: try ${k} as the intermediate vertex for every pair (i, j).`,
    compare: (i, j, k, old, dik, dkj, through, improved) =>
      `D[${i}][${j}] = min(${old}, D[${i}][${k}] + D[${k}][${j}] = ${dik} + ${dkj} = ${through})${improved ? ` → **${through}**: ${i} → ${k} → ${j} is shorter.` : ' → no change.'}`,
    negativeCycle: 'D[v][v] < 0 for some vertex → **negative cycle**.',
    done: (n, checks, updates) =>
      `Done: ${n}³ = ${checks} checks, **${updates} improvements**. D holds the shortest distances for every pair.`,
  },
});

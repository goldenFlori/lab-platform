import { bilingual } from '../kit/text';

// What the strongly-connected-components steps say (#19).

const sq = {
  start:
    'Për çdo kulm të pacaktuar v: SCC(v) = **reach⁺(v) ∩ reach⁻(v)** — kulmet që v i arrin **dhe** që e arrijnë v.',
  forward: (v: string, set: string) =>
    `Zgjedhim **${v}**. BFS përpara: reach⁺(${v}) = {${set}} — kulmet që arrihen nga ${v}.`,
  backward: (v: string, set: string) =>
    `BFS mbrapa (harqet e kthyera): reach⁻(${v}) = {${set}} — kulmet që arrijnë ${v}.`,
  component: (n: number, set: string, single: boolean) =>
    `Prerja jep **SCC ${n} = {${set}}**${single ? ' — një kulm i vetëm, pa cikël që e kthen.' : '.'}`,
  strong: 'Një komponente e vetme: digrafi **është i lidhur fort** — çdo kulm arrin çdo kulm.',
  done: (n: number) => `Gjithsej **${n} komponente të lidhura fort**. Digrafi nuk është i lidhur fort.`,
};

export type SccText = typeof sq;

export const SCC_TEXT = bilingual<SccText>(sq, {
  start:
    'For every unassigned vertex v: SCC(v) = **reach⁺(v) ∩ reach⁻(v)** — the vertices v reaches **and** that reach v.',
  forward: (v, set) => `Pick **${v}**. Forward BFS: reach⁺(${v}) = {${set}} — the vertices reachable from ${v}.`,
  backward: (v, set) => `Backward BFS (edges reversed): reach⁻(${v}) = {${set}} — the vertices that reach ${v}.`,
  component: (n, set, single) =>
    `The intersection gives **SCC ${n} = {${set}}**${single ? ' — a single vertex, with no cycle back to it.' : '.'}`,
  strong: 'A single component: the digraph **is strongly connected** — every vertex reaches every vertex.',
  done: (n) => `**${n} strongly connected components** in all. The digraph is not strongly connected.`,
});

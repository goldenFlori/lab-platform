import { bilingual } from '../kit/text';

// What Kruskal with union-find says (#132), in both languages.

const sq = {
  start: (list: string) =>
    `Renditim brinjët sipas peshës: ${list}. Çdo kulm nis në bashkësinë e vet (rrënjë e vetvetes, rang 0).`,
  consider: (edge: string, pu: string, ru: string, pv: string, rv: string) =>
    `Shqyrtojmë **${edge}**: find ndjek prindërit ${pu} → rrënja **${ru}**, dhe ${pv} → rrënja **${rv}**.`,
  compressed: (list: string) => ` Kompresimi i rrugës: ${list} tani tregojnë drejt rrënjës.`,
  unionRank: (child: string, root: string) =>
    `Rrënjë të ndryshme → **pranohet**. Bashkimi sipas rangut: ${child} (rang më i vogël) varet nën ${root}.`,
  unionTie: (child: string, root: string, rank: number) =>
    `Rrënjë të ndryshme → **pranohet**. Rangje të barabarta: ${child} varet nën ${root}, dhe rangu i ${root} bëhet ${rank}.`,
  reject: (root: string) => `E njëjta rrënjë (${root}) → **refuzohet**: brinja do të mbyllte një cikël.`,
  done: (n: number, total: number) =>
    `Përfundoi: ${n} brinjë (= |V| − 1), pesha **${total}**. Union-find e bën çdo find pothuajse O(1): gjithsej O(E log E), nga renditja.`,
};

export type UnionFindText = typeof sq;

export const UNION_FIND_TEXT = bilingual<UnionFindText>(sq, {
  start: (list) => `Sort the edges by weight: ${list}. Every vertex starts in its own set (its own root, rank 0).`,
  consider: (edge, pu, ru, pv, rv) =>
    `Consider **${edge}**: find follows the parents ${pu} → root **${ru}**, and ${pv} → root **${rv}**.`,
  compressed: (list) => ` Path compression: ${list} now point straight at the root.`,
  unionRank: (child, root) =>
    `Different roots → **accept**. Union by rank: ${child} (the smaller rank) goes under ${root}.`,
  unionTie: (child, root, rank) =>
    `Different roots → **accept**. Equal ranks: ${child} goes under ${root}, and ${root}'s rank becomes ${rank}.`,
  reject: (root) => `The same root (${root}) → **reject**: the edge would close a cycle.`,
  done: (n, total) =>
    `Done: ${n} edges (= |V| − 1), weight **${total}**. Union-find makes each find almost O(1): O(E log E) in all, from the sorting.`,
});

import { type ComponentType, lazy } from 'react';
import type { VisualizerId } from '../shared/visualizers';

// The 13 visualizations, each in its own chunk that loads the first time one is shown. A notebook's
// embed passes props that override a visualization's defaults (a preset, a mode, the values).

export type VizProps = Record<string, unknown>;

const load = (importer: () => Promise<{ default: unknown }>) =>
  lazy(importer as () => Promise<{ default: ComponentType<VizProps> }>);

export const VIZ: Record<VisualizerId, { Component: ReturnType<typeof load>; summary: string }> = {
  renditja: {
    Component: load(() => import('./SortingViz')),
    summary: 'Algoritmet e renditjes hap pas hapi, me pseudokodin dhe kompleksitetin e secilit.',
  },
  'gara-e-krahasimeve': {
    Component: load(() => import('./SortRaceViz')),
    summary: 'I njëjti input, tre algoritme. Kush ka nevojë për më pak krahasime përfundon i pari.',
  },
  kompleksiteti: {
    Component: load(() => import('./ComplexityViz')),
    summary: 'Lëvizni n dhe shihni sa operacione kërkon secila klasë kompleksiteti.',
  },
  'gjej-algoritmin': {
    Component: load(() => import('./GuessAlgoGame')),
    summary: 'Një listë u rendit me një algoritëm të fshehur. Gjejeni nga numri i krahasimeve.',
  },
  grafet: {
    Component: load(() => import('./GraphLab')),
    summary: 'Ndërtoni një graf, lexoni vetitë dhe paraqitjet e tij, pastaj përshkojeni ose gjeni pemën minimale.',
  },
  labirinti: {
    Component: load(() => import('./MazeViz')),
    summary: 'I njëjti labirint, dy strategji: radha (BFS) zgjerohet në valë, stiva (DFS) shkon sa më thellë.',
  },
  'scc-topologjike': {
    Component: load(() => import('./SccTopoViz')),
    summary: 'Komponentët fort të lidhur dhe renditjet topologjike të një grafi të drejtuar.',
  },
  rruget: {
    Component: load(() => import('./PathsViz')),
    summary: 'I njëjti graf, dy algoritme krah për krah: Dijkstra zgjedh me lakmi, Bellman-Ford relakson çdo brinjë.',
  },
  'kuizi-bellman-ford': {
    Component: load(() => import('./BfQuiz')),
    summary: 'Grafi i kuizit të laboratorit, me harqe me peshë pozitive dhe negative.',
  },
  'floyd-warshall': {
    Component: load(() => import('./FloydViz')),
    summary: 'Rrugët ndërmjet të gjitha çifteve: a e shkurton kalimi nëpër k rrugën nga i te j?',
  },
  'gara-e-rrugeve': {
    Component: load(() => import('./PathRaceGame')),
    summary: 'Ndërtoni rrugën më të shkurtër qytet pas qyteti; matrica P zbulon rrugën optimale.',
  },
  'rrjedha-max': {
    Component: load(() => import('./MaxFlowViz')),
    summary: 'Ford-Fulkerson rrit rrjedhën sa kohë ka rrugë rritëse; kulmet e arritshme japin prerjen minimale.',
  },
  ciftezimi: {
    Component: load(() => import('./MatchingViz')),
    summary: 'Çiftëzimi maksimum dhe problemi i caktimit, të zgjidhur me rrjedhë maksimale.',
  },
};

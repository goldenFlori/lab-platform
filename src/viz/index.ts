import { type ComponentType, lazy } from 'react';
import type { VisualizerId } from '../shared/visualizers';

// The visualizations, each in its own chunk that loads the first time one is shown. A notebook's
// embed passes props that override a visualization's defaults (a preset, a mode, the values).

export type VizProps = Record<string, unknown>;

const load = (importer: () => Promise<{ default: unknown }>) =>
  lazy(importer as () => Promise<{ default: ComponentType<VizProps> }>);

export const VIZ: Record<VisualizerId, { Component: ReturnType<typeof load> }> = {
  renditja: {
    Component: load(() => import('./SortingViz')),
  },
  'gara-e-krahasimeve': {
    Component: load(() => import('./SortRaceViz')),
  },
  kompleksiteti: {
    Component: load(() => import('./ComplexityViz')),
  },
  'gjej-algoritmin': {
    Component: load(() => import('./GuessAlgoGame')),
  },
  grafet: {
    Component: load(() => import('./GraphLab')),
  },
  labirinti: {
    Component: load(() => import('./MazeViz')),
  },
  'scc-topologjike': {
    Component: load(() => import('./SccTopoViz')),
  },
  rruget: {
    Component: load(() => import('./PathsViz')),
  },
  'kuizi-bellman-ford': {
    Component: load(() => import('./BfQuiz')),
  },
  'floyd-warshall': {
    Component: load(() => import('./FloydViz')),
  },
  'gara-e-rrugeve': {
    Component: load(() => import('./PathRaceGame')),
  },
  'rrjedha-max': {
    Component: load(() => import('./MaxFlowViz')),
  },
  ciftezimi: {
    Component: load(() => import('./MatchingViz')),
  },
  'pema-rekursive': {
    Component: load(() => import('./RecursionTreeViz')),
  },
};

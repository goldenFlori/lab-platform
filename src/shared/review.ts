import type { PredictionTopic, TopicResult } from './predictions';

// The review session (#152): short predict questions on fresh inputs, drawn from the algorithms of
// the labs a student has opened. No imports beyond types: the app and the API both use it.

/** The topics a review can ask: every predict topic (the trace tables are practised in the labs). */
export const REVIEW_TOPICS = [
  'insertion',
  'selection',
  'merge',
  'bfs',
  'dfs',
  'kruskal',
  'prim',
  'topo',
  'dijkstra',
  'bellman',
  'floyd',
  'flow',
] as const satisfies readonly PredictionTopic[];

export type ReviewTopic = (typeof REVIEW_TOPICS)[number];

const TRACE_PRESETS: Record<string, ReviewTopic> = {
  'lab05-kruskal': 'kruskal',
  'lab05-prim': 'prim',
  'lab06-kahn': 'topo',
  'lab07-dijkstra': 'dijkstra',
  'lab07-bellman': 'bellman',
  'lab08-floyd': 'floyd',
};

/** What an embedded visualization practises, from its id and the props the lab gives it. */
export function topicsOfEmbed(viz: string, props: Record<string, unknown> | null): ReviewTopic[] {
  const p = props ?? {};
  switch (viz) {
    case 'renditja':
      return p.algo === 'insertion' || p.algo === 'selection' || p.algo === 'merge'
        ? [p.algo]
        : ['insertion', 'selection', 'merge'];
    case 'pema-rekursive':
      return ['merge'];
    case 'grafet':
      return p.mode === 'traverse' ? ['bfs', 'dfs'] : p.mode === 'mst' ? ['kruskal', 'prim'] : [];
    case 'labirinti':
      return ['bfs', 'dfs'];
    case 'kruskal-prim':
      return ['kruskal', 'prim'];
    case 'scc-topologjike':
      return p.mode === 'topo' ? ['topo'] : [];
    case 'rruget':
      return p.view === 'dijkstra' ? ['dijkstra'] : p.view === 'bellman' ? ['bellman'] : ['dijkstra', 'bellman'];
    case 'kuizi-bellman-ford':
      return ['bellman'];
    case 'floyd-warshall':
    case 'gara-e-rrugeve':
      return ['floyd'];
    case 'rrjedha-max':
    case 'ciftezimi':
      return ['flow'];
    case 'tabela-gjurmimit': {
      const topic = typeof p.preset === 'string' ? TRACE_PRESETS[p.preset] : undefined;
      return topic ? [topic] : [];
    }
    default:
      return [];
  }
}

/** A student's review: the topics they can be asked, each with the first lab that teaches it. */
export type ReviewPlan = {
  topics: { topic: ReviewTopic; labId: string; lab: number; labTitle: string }[];
  /** Their first-try results so far (#151), to bring back the weak topics more often. */
  results: TopicResult[];
};

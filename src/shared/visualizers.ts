// The 13 interactive visualizations (#14), by the ids the course site uses in its embeds.
// No imports: the API validates embeds against this list, and the app shows the titles.

export const VISUALIZERS = {
  renditja: 'Vizualizuesi i renditjes',
  'gara-e-krahasimeve': 'Gara e krahasimeve',
  kompleksiteti: 'Eksploruesi i kompleksitetit',
  'gjej-algoritmin': 'Lojë: Gjej algoritmin!',
  grafet: 'Laboratori i grafeve',
  labirinti: 'Labirinti — BFS kundrejt DFS',
  'scc-topologjike': 'SCC & renditjet topologjike',
  rruget: 'Dijkstra kundrejt Bellman-Ford',
  'kuizi-bellman-ford': 'Kuiz: Bellman-Ford',
  'floyd-warshall': 'Floyd-Warshall hap pas hapi',
  'gara-e-rrugeve': 'Lojë: Gara e rrugëve',
  'rrjedha-max': 'Rrjedha max & prerja min',
  ciftezimi: 'Çiftëzimi & caktimet',
} as const;

export type VisualizerId = keyof typeof VISUALIZERS;

export const VISUALIZER_IDS = Object.keys(VISUALIZERS) as VisualizerId[];

export function isVisualizerId(value: string): value is VisualizerId {
  return value in VISUALIZERS;
}

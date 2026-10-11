import { Waypoints } from 'lucide-react';
import { useMemo, useState } from 'react';
import { bfsSteps, dfsSteps } from './algorithms/graphs';
import { GRAPHS_TEXT } from './algorithms/graphs.text';
import { dijkstraSteps, toArcs } from './algorithms/shortest';
import { SHORTEST_TEXT } from './algorithms/shortest.text';
import { VIZLAB_GRAPH_TEXT } from './algorithms/vizlab.text';
import {
  type DrawnGraph,
  drawnGraph,
  fromPath,
  fromTraversal,
  type GraphFrame,
  type VizlabGraphRun,
  vizlabGraphFrames,
} from './algorithms/vizlab-graph';
import { PlayerBar, Segmented } from './kit/controls';
import { type GNode, GraphCanvas } from './kit/GraphCanvas';
import { Legend, Panel, StepNote, VizShell } from './kit/shell';
import { bilingual, useText } from './kit/text';
import { playerKeys, usePlayer } from './kit/usePlayer';

// "Your code, visualized" on graphs (#70): a student's BFS, DFS or Dijkstra, recorded by vizlab,
// plays on the course's graph canvas next to the reference algorithm on the same graph, from the
// vertex the student started at.

type Reference = 'bfs' | 'dfs' | 'dijkstra';

const TEXT = bilingual(
  {
    title: 'Kodi juaj në graf',
    subtitle: 'Hapat që bëri kodi juaj në graf, krahas algoritmit të laboratorit.',
    yours: 'Kodi juaj',
    reference: 'Referenca',
    graph: (n: number, m: number) => `Graf me ${n} kulme dhe ${m} brinjë`,
    current: 'Kulmi aktual',
    visited: 'I vizituar',
    tree: 'Brinjë e pemës',
    considering: 'Po shqyrtohet',
  },
  {
    title: 'Your code on a graph',
    subtitle: "The steps your code took on the graph, next to the lab's algorithm.",
    yours: 'Your code',
    reference: 'Reference',
    graph: (n, m) => `A graph with ${n} vertices and ${m} edges`,
    current: 'Current vertex',
    visited: 'Visited',
    tree: 'Tree edge',
    considering: 'Being looked at',
  },
);

const soft = (color: string, amount = 22) => `color-mix(in oklab, ${color} ${amount}%, transparent)`;

export default function YourGraphViz({ run }: { run: VizlabGraphRun }) {
  const graph = useMemo(() => drawnGraph(run), [run]);
  return graph ? <Visualized run={run} graph={graph} /> : null;
}

function Visualized({ run, graph }: { run: VizlabGraphRun; graph: DrawnGraph }) {
  const L = useText(TEXT);
  const G = useText(GRAPHS_TEXT);
  const P = useText(SHORTEST_TEXT);
  const V = useText(VIZLAB_GRAPH_TEXT);
  const [reference, setReference] = useState<Reference>(graph.weighted ? 'dijkstra' : 'bfs');
  const mine = useMemo(() => vizlabGraphFrames(run, graph, V), [run, graph, V]);
  // The reference starts where the student's code did.
  const start = run.events.find((e) => e.op === 'visit')?.node ?? graph.nodes[0]?.id ?? '';
  const theirs = useMemo((): GraphFrame[] => {
    const { nodes, edges, directed } = graph;
    if (reference === 'dijkstra')
      return dijkstraSteps(nodes, toArcs(edges, directed), start, P).map((s) => fromPath(s, graph));
    const steps =
      reference === 'bfs' ? bfsSteps(nodes, edges, directed, start, G) : dfsSteps(nodes, edges, directed, start, G);
    return steps.map(fromTraversal);
  }, [graph, reference, start, G, P]);
  const frames = useMemo(
    () => Array.from({ length: Math.max(mine.length, theirs.length) }, (_, i) => i),
    [mine.length, theirs.length],
  );
  const player = usePlayer(frames, 700);
  const at = player.step ?? 0;
  const own = mine[Math.min(at, mine.length - 1)];
  const ref = theirs[Math.min(at, theirs.length - 1)];
  if (!own || !ref) return null;

  const options = [
    { value: 'bfs' as const, label: 'BFS' },
    { value: 'dfs' as const, label: 'DFS' },
    ...(graph.weighted ? [{ value: 'dijkstra' as const, label: 'Dijkstra' }] : []),
  ];
  return (
    <VizShell
      title={L.title}
      subtitle={L.subtitle}
      icon={<Waypoints />}
      onKeyDown={playerKeys(player)}
      footer={
        <>
          <StepNote text={own.note} />
          <PlayerBar player={player} />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-2">
        <Panel title={L.yours}>
          <div data-testid="vizlab-graph-mine">
            <Frame graph={graph} frame={own} label={L.graph(graph.nodes.length, graph.edges.length)} />
          </div>
        </Panel>
        <Panel title={`${L.reference}: ${options.find((o) => o.value === reference)?.label ?? ''}`}>
          <div className="grid gap-3">
            <Segmented label={L.reference} value={reference} onChange={setReference} options={options} />
            <Frame graph={graph} frame={ref} label={L.graph(graph.nodes.length, graph.edges.length)} />
            <StepNote text={ref.note} tone="default" />
          </div>
        </Panel>
      </div>
      <div className="px-4 pb-4 sm:px-5">
        <Legend
          items={[
            { color: 'var(--viz-active)', label: L.current },
            { color: 'var(--viz-done)', label: L.visited },
            { color: 'var(--accent)', label: L.tree },
            { color: 'var(--viz-compare)', label: L.considering },
          ]}
        />
      </div>
    </VizShell>
  );
}

/** One side: the graph, its visited vertices numbered, the tree and the edge being looked at. */
function Frame({ graph, frame, label }: { graph: DrawnGraph; frame: GraphFrame; label: string }) {
  const nodeLook = (n: GNode) => {
    const pos = frame.order.indexOf(n.id);
    const current = n.id === frame.current;
    const d = frame.dist?.[n.id];
    return {
      fill: current ? soft('var(--viz-active)', 30) : pos >= 0 ? soft('var(--viz-done)') : undefined,
      stroke: current ? 'var(--viz-active)' : pos >= 0 ? 'var(--viz-done)' : undefined,
      ring: current ? 'var(--viz-active)' : undefined,
      badge: pos >= 0 ? String(pos + 1) : null,
      badgeColor: 'var(--viz-done)',
      sub: d === undefined ? null : `d=${d}`,
    };
  };
  const edgeLook = (_e: unknown, i: number) =>
    i === frame.considering
      ? { stroke: 'var(--viz-compare)', width: 4, front: true }
      : frame.tree.includes(i)
        ? { stroke: 'var(--accent)', width: 4 }
        : {};
  return (
    <GraphCanvas
      nodes={graph.nodes}
      edges={graph.edges}
      directed={graph.directed}
      width={640}
      height={420}
      showWeights={graph.weighted}
      nodeLook={nodeLook}
      edgeLook={edgeLook}
      ariaLabel={label}
    />
  );
}

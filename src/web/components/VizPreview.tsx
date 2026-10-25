import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { VisualizerId } from '../../shared/visualizers';

// Looping previews for the gallery (#125): a few frames of each visualization's own idea, drawn
// in the algorithm-state colours, so a student sees it move before opening it. Each is a small
// SVG, not the visualization itself, so thirteen of them cost almost nothing. They play only while
// on screen, and show their last frame under reduced motion.

const C = {
  idle: 'var(--state-unvisited)',
  frontier: 'var(--state-frontier)',
  current: 'var(--state-current)',
  visited: 'var(--state-visited)',
  path: 'var(--state-path)',
  done: 'var(--state-done)',
  reject: 'var(--state-reject)',
  line: 'var(--viz-line)',
  ink: 'var(--muted)',
};

/** The frame to draw: advances every `ms` while visible, holds the last one a little longer. */
function useFrame(count: number, ms: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [frame, setFrame] = useState(count - 1);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(([entry]) => setActive(!!entry?.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setFrame((f) => (f + 1) % count), frame === count - 1 ? ms * 4 : ms);
    return () => clearTimeout(timer);
  }, [active, frame, count, ms]);
  return { ref, frame };
}

function Frame({ count, ms = 450, children }: { count: number; ms?: number; children: (f: number) => ReactNode }) {
  const { ref, frame } = useFrame(count, ms);
  return (
    <svg ref={ref} viewBox="0 0 200 110" className="h-full w-full" aria-hidden="true">
      {children(frame)}
    </svg>
  );
}

// ---------------------------------------------------------------- sorting

/** Insertion sort's states: the array after each shift, the key's position, the sorted prefix. */
function insertionStates(start: number[]) {
  const a = [...start];
  const states = [{ a: [...a], key: -1, sorted: 0 }];
  for (let i = 1; i < a.length; i++) {
    let j = i;
    while (j > 0 && (a[j - 1] ?? 0) > (a[j] ?? 0)) {
      [a[j - 1], a[j]] = [a[j] ?? 0, a[j - 1] ?? 0];
      j--;
      states.push({ a: [...a], key: j, sorted: i });
    }
    states.push({ a: [...a], key: -1, sorted: i });
  }
  return states;
}
const SORT = insertionStates([5, 2, 8, 3, 7, 1, 6, 4]);

function Bars({ a, color }: { a: number[]; color: (i: number) => string }) {
  return (
    <>
      {a.map((v, i) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: bars are positions; their values move
          key={i}
          x={16 + i * 22}
          y={98 - v * 10}
          width={16}
          height={v * 10}
          rx={3}
          fill={color(i)}
          className="transition-[y,height,fill] duration-300"
        />
      ))}
    </>
  );
}

const Sorting = () => (
  <Frame count={SORT.length} ms={380}>
    {(f) => {
      const s = SORT[f] ?? SORT[0];
      if (!s) return null;
      const last = f === SORT.length - 1;
      return (
        <Bars a={s.a} color={(i) => (last ? C.done : i === s.key ? C.current : i <= s.sorted ? C.visited : C.idle)} />
      );
    }}
  </Frame>
);

const Race = () => (
  <Frame count={11} ms={350}>
    {(f) =>
      (
        [
          ['I', 0.55, C.frontier],
          ['S', 1, C.path],
          ['M', 0.3, C.current],
        ] as const
      ).map(([label, rate, color], r) => (
        <g key={label}>
          <text x={14} y={30 + r * 30} className="fill-[var(--muted)] font-mono text-[11px] font-bold">
            {label}
          </text>
          <rect x={30} y={20 + r * 30} width={150} height={12} rx={6} fill={C.idle} />
          <rect
            x={30}
            y={20 + r * 30}
            width={Math.min(150, f * 15 * rate)}
            height={12}
            rx={6}
            fill={color}
            className="transition-[width] duration-300"
          />
        </g>
      ))
    }
  </Frame>
);

const Complexity = () => (
  <Frame count={9} ms={300}>
    {(f) => {
      const n = (f + 1) / 9;
      const curve = (g: (x: number) => number) =>
        Array.from({ length: 31 }, (_, i) => {
          const x = (i / 30) * n;
          return `${i ? 'L' : 'M'}${18 + x * 168},${96 - Math.min(1, g(x)) * 82}`;
        }).join(' ');
      return (
        <>
          <path d="M18 14 V96 H190" fill="none" stroke={C.line} />
          <path d={curve((x) => x * 0.55)} fill="none" stroke={C.visited} strokeWidth={2.5} />
          <path d={curve((x) => x * Math.log2(1 + x * 7) * 0.3)} fill="none" stroke={C.current} strokeWidth={2.5} />
          <path d={curve((x) => x * x * 1.1)} fill="none" stroke={C.path} strokeWidth={2.5} />
        </>
      );
    }}
  </Frame>
);

const Guess = () => (
  <Frame count={8} ms={420}>
    {(f) => (
      <>
        <text x={100} y={50} textAnchor="middle" className="fill-[var(--foreground)] font-mono text-[26px] font-bold">
          {Math.round(28 * Math.min(f, 5))}
        </text>
        {['I', 'S', 'M'].map((label, i) => (
          <g key={label}>
            <rect
              x={46 + i * 40}
              y={78}
              width={30}
              height={20}
              rx={10}
              fill={f >= 6 && label === 'S' ? C.done : C.idle}
              className="transition-[fill] duration-300"
            />
            <text x={61 + i * 40} y={92} textAnchor="middle" className="fill-[var(--foreground)] text-[11px] font-bold">
              {label}
            </text>
          </g>
        ))}
      </>
    )}
  </Frame>
);

// ---------------------------------------------------------------- graphs

type Pt = [number, number];
const G_NODES: Pt[] = [
  [30, 55],
  [75, 22],
  [75, 88],
  [125, 40],
  [125, 90],
  [172, 60],
];
const G_EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 3],
  [2, 4],
  [3, 5],
  [4, 5],
];

function Graph({
  node,
  edge,
  label,
  nodes = G_NODES,
  edges = G_EDGES,
  directed = false,
}: {
  node: (i: number) => string;
  edge?: (k: number) => string | undefined;
  label?: (i: number) => string | undefined;
  nodes?: Pt[];
  edges?: [number, number][];
  directed?: boolean;
}) {
  return (
    <>
      {directed && (
        <defs>
          <marker
            id="viz-preview-arrow"
            viewBox="0 0 8 8"
            refX="15"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 z" fill={C.line} />
          </marker>
        </defs>
      )}
      {edges.map(([u, v], k) => {
        const a = nodes[u];
        const b = nodes[v];
        if (!a || !b) return null;
        const color = edge?.(k);
        return (
          <line
            key={`${u}-${v}`}
            x1={a[0]}
            y1={a[1]}
            x2={b[0]}
            y2={b[1]}
            stroke={color ?? C.line}
            strokeWidth={color ? 3 : 1.5}
            markerEnd={directed ? 'url(#viz-preview-arrow)' : undefined}
            className="transition-[stroke] duration-300"
          />
        );
      })}
      {nodes.map(([x, y], i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed drawing
        <g key={i}>
          <circle cx={x} cy={y} r={9} fill={node(i)} stroke={C.line} className="transition-[fill] duration-300" />
          {label?.(i) !== undefined && (
            <text
              x={x}
              y={y - 13}
              textAnchor="middle"
              className="fill-[var(--foreground)] font-mono text-[9px] font-bold"
            >
              {label(i)}
            </text>
          )}
        </g>
      ))}
    </>
  );
}

const BFS_ORDER = [0, 1, 2, 3, 4, 5];
const BFS_LEVEL = [0, 1, 1, 2, 2, 3];
const GraphLab = () => (
  <Frame count={BFS_ORDER.length + 1} ms={500}>
    {(f) => (
      <Graph
        node={(i) => (BFS_ORDER.indexOf(i) < f - 1 ? C.visited : BFS_ORDER.indexOf(i) === f - 1 ? C.current : C.idle)}
        label={(i) => (BFS_ORDER.indexOf(i) < f ? String(BFS_LEVEL[i]) : undefined)}
      />
    )}
  </Frame>
);

// A 10×5 maze; 1 is a wall. BFS from the top-left corner floods it level by level.
const MAZE = ['0001000000', '0101011110', '0100010000', '0111010111', '0000000100'];
const MAZE_LEVEL = (() => {
  const level: number[][] = MAZE.map((row) => [...row].map(() => -1));
  const queue: Pt[] = [[0, 0]];
  if (level[0]) level[0][0] = 0;
  for (let head = 0; head < queue.length; head++) {
    const [r, c] = queue[head] ?? [0, 0];
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nr = r + dr;
      const nc = c + dc;
      if (MAZE[nr]?.[nc] === '0' && level[nr]?.[nc] === -1) {
        (level[nr] as number[])[nc] = (level[r]?.[c] ?? 0) + 1;
        queue.push([nr, nc]);
      }
    }
  }
  return level;
})();
const MAZE_MAX = Math.max(...MAZE_LEVEL.flat());

const Maze = () => (
  <Frame count={MAZE_MAX + 2} ms={260}>
    {(f) =>
      MAZE.flatMap((row, r) =>
        [...row].map((cell, c) => {
          const lvl = MAZE_LEVEL[r]?.[c] ?? -1;
          const fill =
            cell === '1' ? 'var(--foreground)' : lvl === f ? C.frontier : lvl >= 0 && lvl < f ? C.visited : C.idle;
          return (
            <rect
              // biome-ignore lint/suspicious/noArrayIndexKey: a cell of a fixed grid, keyed by its row and column
              key={`${r}-${c}`}
              x={10 + c * 18}
              y={8 + r * 19}
              width={17}
              height={18}
              rx={2}
              fill={fill}
              opacity={cell === '1' ? 0.75 : 1}
              className="transition-[fill] duration-200"
            />
          );
        }),
      )
    }
  </Frame>
);

const SCC_GROUPS = [[0, 1, 2], [3, 4], [5]];
const SCC_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 0],
  [2, 3],
  [3, 4],
  [4, 3],
  [4, 5],
];
const SCC_COLORS = [C.current, C.path, C.frontier];
const Scc = () => (
  <Frame count={SCC_GROUPS.length + 1} ms={700}>
    {(f) => {
      const groupOf = (i: number) => SCC_GROUPS.findIndex((g) => g.includes(i));
      return (
        <Graph
          directed
          edges={SCC_EDGES}
          node={(i) => (groupOf(i) < f ? (SCC_COLORS[groupOf(i)] ?? C.idle) : C.idle)}
          edge={(k) => {
            const [u, v] = SCC_EDGES[k] ?? [0, 0];
            const g = groupOf(u);
            return g === groupOf(v) && g < f ? SCC_COLORS[g] : undefined;
          }}
        />
      );
    }}
  </Frame>
);

// ---------------------------------------------------------------- shortest paths

const W_EDGES: [number, number][] = G_EDGES;
// Dijkstra from 0 with weights 0–1: 4, 0–2: 2, 1–3: 5, 2–3: 4, 2–4: 4, 3–5: 2, 4–5: 3.
const DIST_FRAMES = [
  ['0', '∞', '∞', '∞', '∞', '∞'],
  ['0', '4', '2', '∞', '∞', '∞'],
  ['0', '4', '2', '6', '6', '∞'],
  ['0', '4', '2', '6', '6', '8'],
];
/** The shortest path 0 → 2 → 3 → 5, by edge index. */
const PATH_EDGES = [1, 3, 5];
const Paths = () => (
  <Frame count={DIST_FRAMES.length + 1} ms={650}>
    {(f) => {
      const d = DIST_FRAMES[Math.min(f, DIST_FRAMES.length - 1)] ?? [];
      const end = f >= DIST_FRAMES.length;
      return (
        <Graph
          edges={W_EDGES}
          node={(i) => (end && [0, 2, 3, 5].includes(i) ? C.path : d[i] !== '∞' ? C.visited : C.idle)}
          edge={(k) => (end && PATH_EDGES.includes(k) ? C.path : undefined)}
          label={(i) => d[i]}
        />
      );
    }}
  </Frame>
);

const Quiz = () => (
  <Frame count={5} ms={600}>
    {(f) => (
      <>
        <rect x={20} y={10} width={160} height={18} rx={9} fill={C.idle} />
        {[0, 1, 2, 3].map((i) => {
          const fill =
            f >= 3 && i === 2 ? C.done : f >= 2 && i === 1 ? C.reject : f >= 1 && i === 1 ? C.frontier : C.idle;
          return (
            <rect
              key={i}
              x={i % 2 ? 104 : 20}
              y={40 + Math.floor(i / 2) * 32}
              width={76}
              height={24}
              rx={8}
              fill={fill}
              className="transition-[fill] duration-300"
            />
          );
        })}
      </>
    )}
  </Frame>
);

const INF = '∞';
// Not the matrix of any class problem: a preview must not show an exercise's answer.
const FW_START = [
  ['0', '4', INF, '9'],
  [INF, '0', '3', INF],
  ['2', INF, '0', '6'],
  [INF, '1', INF, '0'],
];
/** What Floyd-Warshall changes for k = 0, 1, 2, 3 (computed from FW_START). */
const FW_CHANGES: [number, number, string][][] = [
  [[2, 1, '6']],
  [
    [0, 2, '7'],
    [3, 2, '4'],
  ],
  [
    [1, 0, '5'],
    [1, 3, '9'],
    [3, 0, '6'],
  ],
  [],
];
const Floyd = () => (
  <Frame count={FW_CHANGES.length + 1} ms={800}>
    {(f) => {
      const m = FW_START.map((row) => [...row]);
      const fresh = new Set<string>();
      FW_CHANGES.slice(0, f).forEach((step, k) => {
        for (const [i, j, v] of step) {
          if (m[i]) m[i][j] = v;
          if (k === f - 1) fresh.add(`${i}-${j}`);
        }
      });
      const k = f - 1;
      return m.flatMap((row, i) =>
        row.map((v, j) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a cell of a fixed matrix, keyed by its row and column
          <g key={`${i}-${j}`}>
            <rect
              x={44 + j * 29}
              y={6 + i * 25}
              width={27}
              height={23}
              rx={4}
              fill={fresh.has(`${i}-${j}`) ? C.done : i === k || j === k ? C.frontier : C.idle}
              className="transition-[fill] duration-300"
            />
            <text
              x={57.5 + j * 29}
              y={22 + i * 25}
              textAnchor="middle"
              className={`font-mono text-[10px] font-bold ${
                fresh.has(`${i}-${j}`) || i === k || j === k ? 'fill-[#10172a]' : 'fill-[var(--foreground)]'
              }`}
            >
              {v}
            </text>
          </g>
        )),
      );
    }}
  </Frame>
);

const ROUTE: Pt[] = [
  [24, 84],
  [62, 40],
  [104, 66],
  [142, 26],
  [180, 52],
];
const PathRace = () => (
  <Frame count={ROUTE.length + 1} ms={500}>
    {(f) => (
      <>
        {[
          [24, 30],
          [70, 92],
          [130, 92],
          [176, 94],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={6} fill={C.idle} stroke={C.line} />
        ))}
        <polyline
          points={ROUTE.slice(0, Math.max(1, f))
            .map(([x, y]) => `${x},${y}`)
            .join(' ')}
          fill="none"
          stroke={C.path}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {ROUTE.map(([x, y], i) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r={7}
            fill={i < f ? (i === 0 || i === ROUTE.length - 1 ? C.current : C.path) : C.idle}
            stroke={C.line}
            className="transition-[fill] duration-300"
          />
        ))}
      </>
    )}
  </Frame>
);

// ---------------------------------------------------------------- flows

const F_NODES: Pt[] = [
  [20, 55],
  [80, 22],
  [80, 88],
  [140, 22],
  [140, 88],
  [182, 55],
];
const F_EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
  [1, 4],
  [3, 5],
  [4, 5],
];
const F_FLOW = [
  [0, 0, 0, 0, 0, 0, 0],
  [3, 0, 3, 0, 0, 3, 0],
  [3, 3, 3, 3, 0, 3, 3],
  [5, 3, 3, 3, 2, 3, 5],
];
const Flow = () => (
  <Frame count={F_FLOW.length + 1} ms={700}>
    {(f) => {
      const flow = F_FLOW[Math.min(f, F_FLOW.length - 1)] ?? [];
      const cut = f >= F_FLOW.length;
      return (
        <>
          {F_EDGES.map(([u, v], k) => {
            const a = F_NODES[u];
            const b = F_NODES[v];
            if (!a || !b) return null;
            return (
              <g key={`${u}-${v}`}>
                <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={C.idle} strokeWidth={9} strokeLinecap="round" />
                <line
                  x1={a[0]}
                  y1={a[1]}
                  x2={b[0]}
                  y2={b[1]}
                  stroke={C.current}
                  strokeWidth={((flow[k] ?? 0) / 5) * 9}
                  strokeLinecap="round"
                  className="transition-[stroke-width] duration-500"
                />
              </g>
            );
          })}
          {cut && <line x1={160} y1={6} x2={160} y2={104} stroke={C.reject} strokeWidth={2} strokeDasharray="5 4" />}
          {F_NODES.map(([x, y], i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed drawing
            <circle key={i} cx={x} cy={y} r={8} fill={i === 0 || i === 5 ? C.path : 'var(--surface)'} stroke={C.line} />
          ))}
        </>
      );
    }}
  </Frame>
);

const MATCH: [number, number][] = [
  [0, 1],
  [1, 0],
  [2, 3],
  [3, 2],
];
const Matching = () => (
  <Frame count={MATCH.length + 1} ms={550}>
    {(f) => (
      <>
        {MATCH.slice(0, f).map(([l, r]) => (
          <line key={`${l}-${r}`} x1={50} y1={16 + l * 26} x2={150} y2={16 + r * 26} stroke={C.path} strokeWidth={3} />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <circle
              cx={50}
              cy={16 + i * 26}
              r={8}
              fill={MATCH.slice(0, f).some(([l]) => l === i) ? C.current : C.idle}
            />
            <circle
              cx={150}
              cy={16 + i * 26}
              r={8}
              fill={MATCH.slice(0, f).some(([, r]) => r === i) ? C.visited : C.idle}
            />
          </g>
        ))}
      </>
    )}
  </Frame>
);

// Merge Sort's recursion tree: split down four levels, then merged back up from the leaves.
const RecursionTree = () => (
  <Frame count={9} ms={420}>
    {(f) =>
      [1, 2, 4, 8].flatMap((count, depth) => {
        if (f < depth) return [];
        const merged = f >= 8 - depth;
        const width = 176 / count;
        return Array.from({ length: count }, (_, i) => (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed drawing, keyed by level and position
            key={`${depth}-${i}`}
            x={12 + i * width + 2}
            y={10 + depth * 24}
            width={width - 4}
            height={16}
            rx={4}
            fill={merged ? C.done : depth === f ? C.current : C.idle}
            className="transition-[fill] duration-300"
          />
        ));
      })
    }
  </Frame>
);

const PREVIEWS: Record<VisualizerId, () => ReactNode> = {
  renditja: Sorting,
  'gara-e-krahasimeve': Race,
  kompleksiteti: Complexity,
  'gjej-algoritmin': Guess,
  grafet: GraphLab,
  labirinti: Maze,
  'scc-topologjike': Scc,
  rruget: Paths,
  'kuizi-bellman-ford': Quiz,
  'floyd-warshall': Floyd,
  'gara-e-rrugeve': PathRace,
  'rrjedha-max': Flow,
  ciftezimi: Matching,
  'pema-rekursive': RecursionTree,
};

export function VizPreview({ id }: { id: VisualizerId }) {
  const Preview = PREVIEWS[id];
  return <Preview />;
}

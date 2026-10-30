import { AnimatePresence, m } from 'motion/react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { bfsSteps, dfsSteps } from '../../../viz/algorithms/graphs';
import { GRAPHS_TEXT, type GraphsText } from '../../../viz/algorithms/graphs.text';
import { dijkstraSteps, INF, inf, toArcs } from '../../../viz/algorithms/shortest';
import { SHORTEST_TEXT, type ShortestText } from '../../../viz/algorithms/shortest.text';
import type { GEdge, GNode } from '../../../viz/kit/GraphCanvas';
import { RichText } from '../../../viz/kit/RichText';
import { useText } from '../../../viz/kit/text';
import { useT } from '../../i18n';
import { SPRING } from '../../lib/motion';

// The front page's live graph (#129): the course's own BFS, DFS and Dijkstra, with their
// narration, running on a small weighted graph. A visitor can switch the algorithm or tap a vertex
// to start from it, and watches the data structure underneath (queue, stack, priority queue) do
// the work. It plays on its own, cycling the algorithms, until someone touches it.

type Mode = 'bfs' | 'dfs' | 'dijkstra';
const MODES: Mode[] = ['bfs', 'dfs', 'dijkstra'];

const NODES: GNode[] = [
  { id: 'A', x: 70, y: 200 },
  { id: 'B', x: 180, y: 85 },
  { id: 'C', x: 185, y: 310 },
  { id: 'D', x: 305, y: 205 },
  { id: 'E', x: 320, y: 60 },
  { id: 'F', x: 330, y: 345 },
  { id: 'G', x: 450, y: 110 },
  { id: 'H', x: 445, y: 280 },
  { id: 'I', x: 560, y: 180 },
  { id: 'J', x: 565, y: 345 },
];

const EDGES: GEdge[] = [
  { u: 'A', v: 'B', w: 4 },
  { u: 'A', v: 'C', w: 2 },
  { u: 'B', v: 'C', w: 1 },
  { u: 'B', v: 'E', w: 5 },
  { u: 'C', v: 'D', w: 8 },
  { u: 'C', v: 'F', w: 10 },
  { u: 'D', v: 'E', w: 2 },
  { u: 'D', v: 'G', w: 6 },
  { u: 'D', v: 'H', w: 3 },
  { u: 'E', v: 'G', w: 7 },
  { u: 'F', v: 'H', w: 4 },
  { u: 'G', v: 'I', w: 2 },
  { u: 'H', v: 'I', w: 5 },
  { u: 'H', v: 'J', w: 6 },
  { u: 'I', v: 'J', w: 3 },
  { u: 'F', v: 'J', w: 9 },
];

const at = new Map(NODES.map((n) => [n.id, n]));

/** One moment of any of the three algorithms, in the terms the drawing needs. */
export type Frame = {
  note: string;
  current: string | null;
  /** Finished: dequeued, popped or settled. */
  done: string[];
  /** The data structure's contents, in its own order (queue front first, stack top last). */
  frontier: string[];
  tree: number[];
  considering: number | null;
  /** A level (BFS) or a distance (Dijkstra) beside each vertex. */
  badge: Record<string, string>;
};

const edgeOf = (a: string, b: string) => EDGES.findIndex((e) => (e.u === a && e.v === b) || (e.u === b && e.v === a));

export function framesOf(mode: Mode, start: string, graphs: GraphsText, shortest: ShortestText): Frame[] {
  if (mode === 'dijkstra') {
    return dijkstraSteps(NODES, toArcs(EDGES, false), start, shortest).map((s) => ({
      note: s.note,
      current: s.current,
      done: s.settled.filter((v) => v !== s.current),
      frontier: NODES.filter((n) => !s.settled.includes(n.id) && s.dist[n.id] !== INF)
        .sort((a, b) => s.dist[a.id] - s.dist[b.id])
        .map((n) => n.id),
      tree: NODES.flatMap((n) => {
        const p = s.prev[n.id];
        return p ? [edgeOf(p, n.id)] : [];
      }),
      considering: s.relaxing,
      badge: Object.fromEntries(NODES.map((n) => [n.id, inf(s.dist[n.id])])),
    }));
  }
  const steps = (mode === 'bfs' ? bfsSteps : dfsSteps)(NODES, EDGES, false, start, graphs);
  return steps.map((s) => ({
    note: s.note,
    current: s.current,
    done: s.order.filter((v) => v !== s.current),
    frontier: s.frontier,
    tree: s.tree,
    considering: s.considering,
    badge: s.level ? Object.fromEntries(Object.entries(s.level).map(([v, l]) => [v, String(l)])) : {},
  }));
}

const STATE = {
  idle: 'var(--surface)',
  frontier: 'var(--state-frontier)',
  current: 'var(--state-current)',
  done: 'var(--state-visited)',
};

export function LiveGraph() {
  const t = useT();
  const graphs = useText(GRAPHS_TEXT);
  const shortest = useText(SHORTEST_TEXT);
  const [mode, setMode] = useState<Mode>('bfs');
  const [start, setStart] = useState('A');
  const [touched, setTouched] = useState(false);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const frames = useMemo(() => framesOf(mode, start, graphs, shortest), [mode, start, graphs, shortest]);
  const frame = frames[Math.min(index, frames.length - 1)] ?? frames[0];

  // Play only while it is on screen and the tab is open.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting && !document.hidden));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const last = index >= frames.length - 1;
    if (last && touched) return;
    const timer = setTimeout(
      () => {
        if (!last) return setIndex(index + 1);
        // Untouched: the next algorithm, from another vertex.
        const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length] ?? 'bfs';
        setMode(next);
        setStart(NODES[Math.floor(Math.random() * NODES.length)]?.id ?? 'A');
        setIndex(0);
      },
      last ? 3200 : mode === 'dijkstra' ? 720 : 620,
    );
    return () => clearTimeout(timer);
  }, [visible, index, frames.length, touched, mode]);

  const run = (nextMode: Mode, nextStart: string) => {
    setTouched(true);
    setMode(nextMode);
    setStart(nextStart);
    setIndex(0);
  };

  const onKey = (event: KeyboardEvent, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      run(mode, id);
    }
  };

  if (!frame) return null;
  const inFrontier = new Set(frame.frontier);
  const fill = (id: string) =>
    id === frame.current
      ? STATE.current
      : frame.done.includes(id)
        ? STATE.done
        : inFrontier.has(id)
          ? STATE.frontier
          : STATE.idle;

  return (
    <div
      ref={box}
      className="relative rounded-3xl border border-border bg-surface/80 p-3 shadow-surface backdrop-blur sm:p-4"
      data-testid="live-graph"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <fieldset className="flex rounded-full border border-border bg-surface-secondary p-1">
          <legend className="sr-only">{t.home.hero.modeGroup}</legend>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => run(m, start)}
              className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
                mode === m ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground'
              }`}
            >
              {t.home.hero.modes[m]}
            </button>
          ))}
        </fieldset>
        <p className="text-xs text-muted">{t.home.hero.hint}</p>
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: an SVG drawing that holds focusable vertices; a fieldset cannot */}
      <svg viewBox="0 0 630 400" className="mt-2 w-full" role="group" aria-label={t.home.hero.graph}>
        {EDGES.map((e, i) => {
          const a = at.get(e.u);
          const b = at.get(e.v);
          if (!a || !b) return null;
          const tree = frame.tree.includes(i);
          const now = frame.considering === i;
          return (
            <g key={`${e.u}${e.v}`}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={now ? 'var(--state-current)' : tree ? 'var(--state-path)' : 'var(--viz-line)'}
                strokeWidth={now ? 3 : tree ? 4 : 1.6}
                strokeDasharray={now ? '6 5' : undefined}
                strokeLinecap="round"
                className="transition-[stroke,stroke-width] duration-300"
              />
              {mode === 'dijkstra' && (
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 6}
                  textAnchor="middle"
                  className="fill-muted font-mono text-[13px]"
                  paintOrder="stroke"
                  stroke="var(--surface)"
                  strokeWidth={5}
                >
                  {e.w}
                </text>
              )}
            </g>
          );
        })}
        {NODES.map((n) => {
          const current = n.id === frame.current;
          return (
            // biome-ignore lint/a11y/useSemanticElements: an SVG vertex cannot be a <button>; it acts as one
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-label={t.home.hero.node(n.id)}
              onClick={() => run(mode, n.id)}
              onKeyDown={(event) => onKey(event, n.id)}
              className="cursor-pointer outline-none [&:focus-visible>circle.ring]:opacity-100"
            >
              {current && (
                <m.circle
                  cx={n.x}
                  cy={n.y}
                  r={21}
                  fill="none"
                  stroke="var(--state-current)"
                  strokeWidth={2}
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 1.7, opacity: 0 }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: 'easeOut' }}
                  style={{ transformOrigin: `${n.x}px ${n.y}px` }}
                />
              )}
              <circle
                className="ring opacity-0"
                cx={n.x}
                cy={n.y}
                r={27}
                fill="none"
                stroke="var(--focus)"
                strokeWidth={2}
              />
              <m.circle
                cx={n.x}
                cy={n.y}
                r={20}
                stroke={current ? 'var(--state-current)' : 'var(--viz-line)'}
                strokeWidth={1.5}
                animate={{ fill: fill(n.id), scale: current ? 1.12 : 1 }}
                transition={SPRING.snappy}
                style={{ transformOrigin: `${n.x}px ${n.y}px` }}
              />
              <text
                x={n.x}
                y={n.y + 5}
                textAnchor="middle"
                className={`pointer-events-none text-[15px] font-bold ${
                  current ? 'fill-white' : fill(n.id) === STATE.idle ? 'fill-foreground' : 'fill-[#10172a]'
                }`}
              >
                {n.id}
              </text>
            </g>
          );
        })}
        {/* The badges in a layer of their own above the vertices: each vertex button holds only its
            letter, which names it (#192); the narration says what the badges show. */}
        {NODES.map((n) => {
          const badge = frame.badge[n.id];
          return badge === undefined ? null : (
            <g key={`badge-${n.id}`} className="pointer-events-none" data-badge-for={n.id}>
              <rect
                x={n.x + 12}
                y={n.y - 33}
                width={badge.length > 1 ? 26 : 20}
                height={18}
                rx={9}
                fill="var(--foreground)"
              />
              <text
                x={n.x + 12 + (badge.length > 1 ? 13 : 10)}
                y={n.y - 20}
                textAnchor="middle"
                className="fill-background font-mono text-[11px] font-semibold"
              >
                {badge}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-1 flex min-h-9 flex-wrap items-center gap-2 rounded-2xl bg-surface-secondary px-3 py-2">
        <span className="text-xs font-semibold text-muted">{t.home.hero.structure[mode]}</span>
        <ol className="flex flex-wrap gap-1.5" aria-label={t.home.hero.structure[mode]}>
          <AnimatePresence initial={false}>
            {frame.frontier.length === 0 ? (
              <li key="empty" className="text-xs text-muted">
                {t.home.hero.empty}
              </li>
            ) : (
              frame.frontier.map((v, i) => (
                <m.li
                  // biome-ignore lint/suspicious/noArrayIndexKey: a stack may hold the same vertex twice
                  key={`${v}-${i}`}
                  layout
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={SPRING.snappy}
                  className="rounded-lg bg-state-frontier px-2 py-0.5 font-mono text-xs font-bold text-black/80"
                >
                  {v}
                  {mode === 'dijkstra' && <span className="font-normal"> · {frame.badge[v]}</span>}
                </m.li>
              ))
            )}
          </AnimatePresence>
        </ol>
      </div>
      <p className="mt-2 min-h-12 px-1 text-sm text-muted" aria-live={touched ? 'polite' : 'off'}>
        <RichText text={frame.note} />
      </p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted">
        {(
          [
            ['current', 'var(--state-current)'],
            ['frontier', 'var(--state-frontier)'],
            ['done', 'var(--state-visited)'],
            ['tree', 'var(--state-path)'],
          ] as const
        ).map(([key, color]) => (
          <li key={key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />
            {t.home.hero.legend[key]}
          </li>
        ))}
      </ul>
    </div>
  );
}

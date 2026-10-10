import { Button, Chip } from '@heroui/react';
import { Dices, Grid3x3, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { LAB_MAZE, type Maze, type MazeStep, parseMaze, randomMaze, solve } from './algorithms/maze';
import { PlayerBar } from './kit/controls';
import { Legend, StepNote, VizShell } from './kit/shell';
import { bilingual, useText } from './kit/text';
import { playerKeys, usePlayer } from './kit/usePlayer';

/* =====================================================================
 *  Labirinti me BFS dhe DFS — Laboratori 5, Ushtrimi 1
 *  Both algorithms explore the same maze, one cell per step.
 * ===================================================================== */

const CELL = 20;

const TEXT = bilingual(
  {
    start:
      'BFS (majtas) dhe DFS (djathtas) nisin nga **A** dhe kërkojnë **B**. Çdo hap = një qelizë e eksploruar. Klikoni një qelizë për të shtuar ose hequr mur.',
    found: (bfsSteps: number, bfsCells: number, dfsSteps: number, dfsCells: number) =>
      `BFS gjeti rrugën më të shkurtër: **${bfsSteps} hapa**, pasi eksploroi ${bfsCells} qeliza. DFS gjeti një rrugë me **${dfsSteps} hapa** pas ${dfsCells} qelizash — jo domosdoshmërisht më e shkurtra.`,
    noPath: 'Nuk ka rrugë nga A në B: muret e mbyllin plotësisht.',
    step: (t: number, bfs: number, dfs: number) =>
      `Hapi ${t}: BFS ka eksploruar ${bfs} qeliza (zgjerohet në valë, shtresë pas shtrese), DFS ${dfs} (ndjek një korridor deri në fund).`,
    title: 'Labirinti — BFS kundrejt DFS',
    subtitle: 'I njëjti labirint, dy strategji: radha (BFS) zgjerohet në valë, stiva (DFS) shkon sa më thellë.',
    random: 'Labirint i rastit',
    lab: 'Labirinti i laboratorit',
    bfs: 'BFS — radhë (FIFO)',
    dfs: 'DFS — stivë (LIFO)',
    startCell: 'Fillimi A',
    goal: 'Qëllimi B',
    explored: 'E eksploruar',
    frontier: 'Në radhë / stivë',
    path: 'Rruga e gjetur',
    cells: (n: number) => `${n} qeliza`,
    route: (n: number) => `rruga: ${n} hapa`,
    none: "s'ka rrugë",
    board: (title: string, n: number) => `${title}: ${n} qeliza të eksploruara`,
  },
  {
    start:
      'BFS (left) and DFS (right) start from **A** and look for **B**. Each step = one explored cell. Click a cell to add or remove a wall.',
    found: (bfsSteps, bfsCells, dfsSteps, dfsCells) =>
      `BFS found the shortest path: **${bfsSteps} steps**, after exploring ${bfsCells} cells. DFS found a path of **${dfsSteps} steps** after ${dfsCells} cells — not necessarily the shortest.`,
    noPath: 'There is no path from A to B: the walls close it off completely.',
    step: (t, bfs, dfs) =>
      `Step ${t}: BFS has explored ${bfs} cells (it spreads in waves, layer by layer), DFS ${dfs} (it follows a corridor to its end).`,
    title: 'The maze — BFS versus DFS',
    subtitle:
      'The same maze, two strategies: the queue (BFS) spreads in waves, the stack (DFS) goes as deep as it can.',
    random: 'Random maze',
    lab: 'The lab’s maze',
    bfs: 'BFS — queue (FIFO)',
    dfs: 'DFS — stack (LIFO)',
    startCell: 'Start A',
    goal: 'Goal B',
    explored: 'Explored',
    frontier: 'In the queue / stack',
    path: 'The path found',
    cells: (n) => `${n} cells`,
    route: (n) => `path: ${n} steps`,
    none: 'no path',
    board: (title, n) => `${title}: ${n} cells explored`,
  },
);

export default function MazeViz() {
  const [maze, setMaze] = useState<Maze>(() => parseMaze(LAB_MAZE));
  const [edited, setEdited] = useState(false);

  const L = useText(TEXT);
  const runs = useMemo(() => ({ bfs: solve(maze, 'bfs'), dfs: solve(maze, 'dfs') }), [maze]);
  const ticks = useMemo(() => Array.from({ length: Math.max(runs.bfs.length, runs.dfs.length) }, (_, i) => i), [runs]);
  const player = usePlayer(ticks, 90);
  const t = player.index;
  const b = runs.bfs[Math.min(t, runs.bfs.length - 1)];
  const d = runs.dfs[Math.min(t, runs.dfs.length - 1)];
  const bEnd = runs.bfs[runs.bfs.length - 1];
  const dEnd = runs.dfs[runs.dfs.length - 1];

  const toggleWall = (i: number) => {
    if (i === maze.start || i === maze.goal) return;
    const wall = maze.wall.slice();
    wall[i] = !wall[i];
    setMaze({ ...maze, wall });
    setEdited(true);
  };

  const note =
    t === 0
      ? L.start
      : b.done && d.done
        ? bEnd.found
          ? L.found(bEnd.path.length - 1, bEnd.explored.length, dEnd.path.length - 1, dEnd.explored.length)
          : L.noPath
        : L.step(t, b.explored.length, d.explored.length);

  return (
    <VizShell
      title={L.title}
      subtitle={L.subtitle}
      icon={<Grid3x3 />}
      onKeyDown={playerKeys(player)}
      toolbar={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="tertiary"
            onPress={() => {
              setMaze(randomMaze(15, 29, Math.floor(Math.random() * 1e9)));
              setEdited(true);
            }}
          >
            <Dices /> {L.random}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={!edited}
            onPress={() => {
              setMaze(parseMaze(LAB_MAZE));
              setEdited(false);
            }}
          >
            <RotateCcw /> {L.lab}
          </Button>
        </div>
      }
      footer={
        <>
          <StepNote text={note} tone={b.done && d.done ? 'success' : 'accent'} />
          <PlayerBar player={player} />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-2">
        <MazeBoard maze={maze} step={b} title={L.bfs} onToggle={toggleWall} final={bEnd} />
        <MazeBoard maze={maze} step={d} title={L.dfs} onToggle={toggleWall} final={dEnd} />
        <div className="lg:col-span-2">
          <Legend
            items={[
              { color: 'var(--viz-done)', label: L.startCell },
              { color: 'var(--viz-reject)', label: L.goal },
              { color: 'color-mix(in oklab, var(--viz-path) 35%, var(--viz-canvas))', label: L.explored },
              { color: 'var(--viz-compare)', label: L.frontier },
              { color: 'var(--viz-active)', label: L.path },
            ]}
          />
        </div>
      </div>
    </VizShell>
  );
}

function MazeBoard({
  maze,
  step,
  title,
  onToggle,
  final,
}: {
  maze: Maze;
  step: MazeStep;
  title: string;
  onToggle: (i: number) => void;
  final: MazeStep;
}) {
  const L = useText(TEXT);
  const explored = new Set(step.explored);
  const frontier = new Set(step.frontier);
  const path = new Set(step.path);
  const W = maze.cols * CELL,
    H = maze.rows * CELL;
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <div className="flex gap-1.5">
          <Chip size="sm" variant="soft">
            {L.cells(step.explored.length)}
          </Chip>
          {step.done && step.found && (
            <Chip size="sm" variant="soft" color="success">
              {L.route(step.path.length - 1)}
            </Chip>
          )}
          {step.done && !step.found && final.done && (
            <Chip size="sm" variant="soft" color="danger">
              {L.none}
            </Chip>
          )}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full rounded-lg"
        role="img"
        aria-label={L.board(title, step.explored.length)}
      >
        {maze.wall.map((isWall, i) => {
          const r = Math.floor(i / maze.cols),
            c = i % maze.cols;
          let fill = 'var(--viz-canvas)';
          if (isWall) fill = 'color-mix(in oklab, var(--foreground) 72%, var(--surface))';
          else if (path.has(i)) fill = 'var(--viz-active)';
          else if (i === step.current) fill = 'var(--viz-compare)';
          else if (frontier.has(i)) fill = 'color-mix(in oklab, var(--viz-compare) 55%, var(--viz-canvas))';
          else if (explored.has(i)) fill = 'color-mix(in oklab, var(--viz-path) 35%, var(--viz-canvas))';
          if (i === maze.start) fill = 'var(--viz-done)';
          if (i === maze.goal) fill = 'var(--viz-reject)';
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: drawing walls is a pointer shortcut; the buttons make a new maze
            <rect
              // biome-ignore lint/suspicious/noArrayIndexKey: i is the cell's number in the grid
              key={i}
              x={c * CELL}
              y={r * CELL}
              width={CELL}
              height={CELL}
              fill={fill}
              stroke="var(--viz-canvas)"
              strokeWidth={0.6}
              className="cursor-pointer"
              onClick={() => onToggle(i)}
              style={{ transition: 'fill 0.15s' }}
            />
          );
        })}
        {[maze.start, maze.goal].map((i, k) => (
          <text
            key={i}
            x={(i % maze.cols) * CELL + CELL / 2}
            y={Math.floor(i / maze.cols) * CELL + CELL / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12}
            fontWeight={800}
            fill="white"
            style={{ pointerEvents: 'none' }}
          >
            {k === 0 ? 'A' : 'B'}
          </text>
        ))}
      </svg>
    </div>
  );
}

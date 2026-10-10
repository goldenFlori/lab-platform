import { Button, Chip } from '@heroui/react';
import { Dices, Grid3x3, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { LAB_MAZE, type Maze, type MazeStep, parseMaze, randomMaze, solve } from './algorithms/maze';
import { PlayerBar } from './kit/controls';
import { Legend, StepNote, VizShell } from './kit/shell';
import { playerKeys, usePlayer } from './kit/usePlayer';

/* =====================================================================
 *  Labirinti me BFS dhe DFS — Laboratori 5, Ushtrimi 1
 *  Both algorithms explore the same maze, one cell per step.
 * ===================================================================== */

const CELL = 20;

export default function MazeViz() {
  const [maze, setMaze] = useState<Maze>(() => parseMaze(LAB_MAZE));
  const [edited, setEdited] = useState(false);

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
      ? 'BFS (majtas) dhe DFS (djathtas) nisin nga **A** dhe kërkojnë **B**. Çdo hap = një qelizë e eksploruar. Klikoni një qelizë për të shtuar ose hequr mur.'
      : b.done && d.done
        ? bEnd.found
          ? `BFS gjeti rrugën më të shkurtër: **${bEnd.path.length - 1} hapa**, pasi eksploroi ${bEnd.explored.length} qeliza. DFS gjeti një rrugë me **${dEnd.path.length - 1} hapa** pas ${dEnd.explored.length} qelizash — jo domosdoshmërisht më e shkurtra.`
          : 'Nuk ka rrugë nga A në B: muret e mbyllin plotësisht.'
        : `Hapi ${t}: BFS ka eksploruar ${b.explored.length} qeliza (zgjerohet në valë, shtresë pas shtrese), DFS ${d.explored.length} (ndjek një korridor deri në fund).`;

  return (
    <VizShell
      title="Labirinti — BFS kundrejt DFS"
      subtitle="I njëjti labirint, dy strategji: radha (BFS) zgjerohet në valë, stiva (DFS) shkon sa më thellë."
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
            <Dices /> Labirint i rastit
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
            <RotateCcw /> Labirinti i laboratorit
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
        <MazeBoard maze={maze} step={b} title="BFS — radhë (FIFO)" onToggle={toggleWall} final={bEnd} />
        <MazeBoard maze={maze} step={d} title="DFS — stivë (LIFO)" onToggle={toggleWall} final={dEnd} />
        <div className="lg:col-span-2">
          <Legend
            items={[
              { color: 'var(--viz-done)', label: 'Fillimi A' },
              { color: 'var(--viz-reject)', label: 'Qëllimi B' },
              { color: 'color-mix(in oklab, var(--viz-path) 35%, var(--viz-canvas))', label: 'E eksploruar' },
              { color: 'var(--viz-compare)', label: 'Në radhë / stivë' },
              { color: 'var(--viz-active)', label: 'Rruga e gjetur' },
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
            {step.explored.length} qeliza
          </Chip>
          {step.done && step.found && (
            <Chip size="sm" variant="soft" color="success">
              rruga: {step.path.length - 1} hapa
            </Chip>
          )}
          {step.done && !step.found && final.done && (
            <Chip size="sm" variant="soft" color="danger">
              s'ka rrugë
            </Chip>
          )}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full rounded-lg"
        role="img"
        aria-label={`${title}: ${step.explored.length} qeliza të eksploruara`}
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

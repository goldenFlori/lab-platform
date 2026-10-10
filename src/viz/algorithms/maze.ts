/* =====================================================================
 *  Maze solving with BFS and DFS — Laboratori 5, Ushtrimi 1.
 *  The default maze is the exact MAZE_TEXT of the notebook.
 * ===================================================================== */

export const LAB_MAZE = `###                 #########
#   ###################   # #
# ####          #     # # # #
# ########## ######## # # # #
#                     # # # #
##################### # # # #
#   ##                # #   #
# # ## ### ## ######### # # #
# #    #   ##B#         # # #
# # ## ################ # ###
# # ##             #### # # #
# # ############## ## # # # #
# #             ##    # # # #
# #### ######## ####### # # #
######    #             #   #
A      ######################`;

export interface Maze {
  rows: number;
  cols: number;
  wall: boolean[];
  start: number;
  goal: number;
}

export function parseMaze(text: string): Maze {
  const lines = text.split('\n');
  const rows = lines.length;
  const cols = Math.max(...lines.map((l) => l.length));
  const wall: boolean[] = [];
  let start = 0,
    goal = 0;
  lines.forEach((line, r) => {
    for (let c = 0; c < cols; c++) {
      const ch = line[c] ?? ' ';
      wall.push(ch === '#');
      if (ch === 'A') start = r * cols + c;
      if (ch === 'B') goal = r * cols + c;
    }
  });
  return { rows, cols, wall, start, goal };
}

export interface MazeStep {
  explored: number[];
  frontier: number[];
  current: number | null;
  path: number[];
  found: boolean;
  done: boolean;
}

function neighbours(m: Maze, i: number) {
  const r = Math.floor(i / m.cols),
    c = i % m.cols;
  const out: number[] = [];
  // up, right, down, left — the same order for both algorithms
  if (r > 0) out.push(i - m.cols);
  if (c < m.cols - 1) out.push(i + 1);
  if (r < m.rows - 1) out.push(i + m.cols);
  if (c > 0) out.push(i - 1);
  return out.filter((j) => !m.wall[j]);
}

export function solve(m: Maze, algo: 'bfs' | 'dfs'): MazeStep[] {
  const steps: MazeStep[] = [];
  const parent = new Map<number, number>([[m.start, -1]]);
  const explored: number[] = [];
  const frontier: number[] = [m.start];
  const pathTo = (t: number) => {
    const p: number[] = [];
    for (let x = t; x !== -1; x = parent.get(x) ?? -1) p.push(x);
    return p.reverse();
  };
  steps.push({ explored: [], frontier: [m.start], current: null, path: [], found: false, done: false });
  const next = () => (algo === 'bfs' ? frontier.shift() : frontier.pop());
  for (let cur = next(); cur !== undefined; cur = next()) {
    explored.push(cur);
    if (cur === m.goal) {
      steps.push({
        explored: [...explored],
        frontier: [...frontier],
        current: cur,
        path: pathTo(cur),
        found: true,
        done: true,
      });
      return steps;
    }
    for (const n of neighbours(m, cur)) {
      if (parent.has(n)) continue;
      parent.set(n, cur);
      frontier.push(n);
    }
    steps.push({ explored: [...explored], frontier: [...frontier], current: cur, path: [], found: false, done: false });
  }
  steps.push({ explored: [...explored], frontier: [], current: null, path: [], found: false, done: true });
  return steps;
}

/** Random "perfect" maze by recursive backtracking, with a few extra openings. */
export function randomMaze(rows: number, cols: number, seed: number): Maze {
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const wall = new Array(rows * cols).fill(true);
  const at = (r: number, c: number) => r * cols + c;
  const stack: [number, number][] = [[1, 1]];
  wall[at(1, 1)] = false;
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const opts = (
      [
        [-2, 0],
        [2, 0],
        [0, -2],
        [0, 2],
      ] as const
    )
      .map(([dr, dc]) => [r + dr, c + dc, dr, dc] as const)
      .filter(([nr, nc]) => nr > 0 && nc > 0 && nr < rows - 1 && nc < cols - 1 && wall[at(nr, nc)]);
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const [nr, nc, dr, dc] = opts[Math.floor(rnd() * opts.length)];
    wall[at(r + dr / 2, c + dc / 2)] = false;
    wall[at(nr, nc)] = false;
    stack.push([nr, nc]);
  }
  // a few loops so BFS and DFS can find different routes
  for (let k = 0; k < (rows * cols) / 18; k++) {
    const r = 1 + Math.floor(rnd() * (rows - 2)),
      c = 1 + Math.floor(rnd() * (cols - 2));
    if ((r + c) % 2 === 1) wall[at(r, c)] = false;
  }
  return { rows, cols, wall, start: at(rows - 2, 1), goal: at(1, cols - 2) };
}

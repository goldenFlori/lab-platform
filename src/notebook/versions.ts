// A new version of a notebook (#208): which cell of the old one each cell of the new one is, so
// students' saved code, visualizations, exercises and answers move with their cell. Cells are numbered
// by their place in the .ipynb (the converter's srcIndex).
//
// Identical cells are matched first, in order (a longest common subsequence). Between two matched
// cells, the remaining cells are paired the same way by type and count as changed; the rest are added
// or removed. Predictable, so staff can check it before confirming.

export type CellMatch = {
  /** [old, new] for every old cell that lives on, changed or not. */
  map: [number, number][];
  /** Old cells whose new version differs: [old, new]. */
  changed: [number, number][];
  /** Old cells with no place in the new version. */
  removed: number[];
  /** New cells with no old one. */
  added: number[];
  /** Old cells kept as they were. */
  same: number;
};

type SourceCell = { type: string; source: string };

/** The cells of an .ipynb as type and source, in order. */
export function notebookCells(raw: string): SourceCell[] {
  const nb = JSON.parse(raw) as { cells?: { cell_type?: string; source?: string | string[] }[] };
  return (nb.cells ?? []).map((cell) => ({
    type: cell.cell_type ?? 'raw',
    source: (Array.isArray(cell.source) ? cell.source.join('') : (cell.source ?? '')).replace(/\s+$/, ''),
  }));
}

/** The most pairs (i, j) in order with equal(a[i], b[j]): a longest common subsequence. */
function pairsInOrder<T>(a: T[], b: T[], equal: (x: T, y: T) => boolean): [number, number][] {
  const n = a.length;
  const m = b.length;
  const length = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  const at = (i: number, j: number) => (length[i] as Uint16Array)[j] as number;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      (length[i] as Uint16Array)[j] = equal(a[i] as T, b[j] as T)
        ? at(i + 1, j + 1) + 1
        : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const pairs: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (equal(a[i] as T, b[j] as T) && at(i, j) === at(i + 1, j + 1) + 1) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (at(i + 1, j) >= at(i, j + 1)) i++;
    else j++;
  }
  return pairs;
}

export function matchCells(before: SourceCell[], after: SourceCell[]): CellMatch {
  const anchors = pairsInOrder(before, after, (x, y) => x.type === y.type && x.source === y.source);
  const result: CellMatch = { map: [], changed: [], removed: [], added: [], same: anchors.length };
  // The gaps between anchors (and after the last one): pair what is left by type, in order.
  let prevOld = -1;
  let prevNew = -1;
  for (const [oldAt, newAt] of [...anchors, [before.length, after.length] as [number, number]]) {
    const olds = range(prevOld + 1, oldAt);
    const news = range(prevNew + 1, newAt);
    const pairs = pairsInOrder(
      olds.map((o) => (before[o] as SourceCell).type),
      news.map((j) => (after[j] as SourceCell).type),
      (x, y) => x === y,
    ).map(([i, j]) => [olds[i], news[j]] as [number, number]);
    const pairedOld = new Set(pairs.map(([o]) => o));
    const pairedNew = new Set(pairs.map(([, j]) => j));
    result.map.push(...pairs);
    result.changed.push(...pairs);
    result.removed.push(...olds.filter((o) => !pairedOld.has(o)));
    result.added.push(...news.filter((j) => !pairedNew.has(j)));
    if (oldAt < before.length) result.map.push([oldAt, newAt]);
    prevOld = oldAt;
    prevNew = newAt;
  }
  result.map.sort((a, b) => a[0] - b[0]);
  return result;
}

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, k) => from + k);

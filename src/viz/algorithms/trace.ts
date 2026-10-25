/* =====================================================================
 *  Trace tables (#150): the class problems students trace by hand,
 *  as the table the algorithm itself fills. Each row is what the
 *  student writes after one step; cells are kept as canonical text so
 *  that what they type can be compared after normalizing it.
 * ===================================================================== */

import type { GEdge } from '../kit/GraphCanvas';
import { natural } from './graphs';

export type CellKind = 'vertex' | 'number' | 'edge' | 'list' | 'decision' | 'yesno';

export interface TraceColumn {
  key: string;
  label: string;
  kind: CellKind;
  /** Which rule of the algorithm the column follows; shown on a wrong cell, never the value. */
  rule: string;
}

export interface TraceRow {
  label: string;
  cells: Record<string, string>;
  /** What the graph shows for this row. */
  mark: { vertices: string[]; edges: number[]; current: string | null };
}

export interface Trace {
  columns: TraceColumn[];
  /** The starting state, given to the student. */
  given: TraceRow;
  rows: TraceRow[];
  /** A matrix trace (Floyd-Warshall) lays each row out as an n × n grid. */
  matrix?: string[];
}

/** The words of a trace, in the interface language (trace.text.ts). */
export interface TraceWords {
  start: string;
  pass: (n: number) => string;
  check: (n: number) => string;
  step: (n: number) => string;
  k: (v: string) => string;
  cols: {
    chosen: string;
    dist: (v: string) => string;
    changed: string;
    edge: string;
    decision: string;
    total: string;
    removed: string;
    queue: string;
  };
  rules: {
    dijkstraChosen: string;
    dijkstraDist: string;
    bellmanDist: string;
    bellmanChanged: string;
    primEdge: string;
    kruskalEdge: string;
    kruskalDecision: string;
    total: string;
    kahnRemoved: string;
    kahnQueue: string;
    floyd: string;
  };
  accept: string;
  reject: string;
  yes: string;
  no: string;
}

export const INF_TEXT = '∞';
export const EMPTY_TEXT = '∅';

const fmt = (n: number) => (n === Infinity ? INF_TEXT : String(n));
const edgeText = (u: string, v: string) => [u, v].sort(natural).join('–');

/* ------------------------------------------------------------ input */

const words = (raw: string) =>
  raw
    .split(/[\s,;→>{}[\]()]+/)
    .map((w) => w.trim())
    .filter(Boolean);

/**
 * What a student typed, in the canonical form of the column, or null when it cannot mean anything
 * (so it counts as wrong, not as empty). `ids` are the graph's vertices, to read "AC" as A–C.
 */
export function normalize(kind: CellKind, raw: string, ids: string[]): string | null {
  const text = raw.trim().replace(/−/g, '-');
  if (!text) return null;
  const lower = text.toLowerCase();
  const upper = (w: string) => ids.find((id) => id.toUpperCase() === w.toUpperCase()) ?? null;
  switch (kind) {
    case 'number': {
      if (['∞', 'inf', 'oo', 'infinity', 'pafund'].includes(lower)) return INF_TEXT;
      const n = Number(text.replace(',', '.'));
      return Number.isFinite(n) ? String(n) : null;
    }
    case 'vertex':
      return upper(text);
    case 'edge': {
      let parts = text.split(/\s*[-–—,\s]\s*/).filter(Boolean);
      if (parts.length === 1 && text.length === 2) parts = [...text];
      if (parts.length !== 2) return null;
      const [u, v] = parts.map(upper);
      return u && v ? edgeText(u, v) : null;
    }
    case 'list': {
      if (['-', '—', '∅', 'bosh', 'empty', '[]', '{}'].includes(lower)) return EMPTY_TEXT;
      const list = words(text).map(upper);
      return list.every((v) => v !== null) ? list.join(', ') : null;
    }
    case 'decision':
      if (/^(p|a)/.test(lower)) return 'accept';
      if (/^r/.test(lower)) return 'reject';
      return null;
    case 'yesno':
      if (/^(po|p|yes|y)$/.test(lower)) return 'yes';
      if (/^(jo|j|no|n)$/.test(lower)) return 'no';
      return null;
  }
}

/** The first cell of a row that does not match, in column order, or null when the row is right. */
export function firstWrong(trace: Trace, row: TraceRow, answers: Record<string, string>, ids: string[]) {
  const keys = trace.matrix
    ? trace.matrix.flatMap((i) => trace.matrix?.map((j) => `${i},${j}`) ?? [])
    : trace.columns.map((c) => c.key);
  for (const key of keys) {
    const column = trace.matrix ? trace.columns[0] : trace.columns.find((c) => c.key === key);
    if (!column) continue;
    if (normalize(column.kind, answers[key] ?? '', ids) !== row.cells[key]) return { key, column };
  }
  return null;
}

/** A canonical cell as the table shows it. */
export function display(kind: CellKind, value: string, W: TraceWords) {
  if (kind === 'decision') return value === 'accept' ? W.accept : W.reject;
  if (kind === 'yesno') return value === 'yes' ? W.yes : W.no;
  return value;
}

/* ------------------------------------------------------------ algorithms */

interface Graph {
  ids: string[];
  edges: GEdge[];
  directed: boolean;
}

const distColumns = (ids: string[], W: TraceWords, rule: string): TraceColumn[] =>
  ids.map((v) => ({ key: `d:${v}`, label: W.cols.dist(v), kind: 'number', rule }));

const distCells = (ids: string[], dist: Record<string, number>) =>
  Object.fromEntries(ids.map((v) => [`d:${v}`, fmt(dist[v] ?? Infinity)]));

/** Dijkstra: per iteration, the vertex chosen and every distance after relaxing its edges. */
export function dijkstraTrace({ ids, edges, directed }: Graph, src: string, W: TraceWords): Trace {
  const dist: Record<string, number> = Object.fromEntries(ids.map((v) => [v, Infinity]));
  dist[src] = 0;
  const settled: string[] = [];
  const rows: TraceRow[] = [];
  const out = (u: string) =>
    edges.flatMap((e, i) =>
      e.u === u ? [{ v: e.v, w: e.w ?? 0, i }] : !directed && e.v === u ? [{ v: e.u, w: e.w ?? 0, i }] : [],
    );
  for (;;) {
    const open = ids.filter((v) => !settled.includes(v) && dist[v] !== Infinity).sort(natural);
    if (!open.length) break;
    const u = open.reduce((a, b) => ((dist[b] ?? Infinity) < (dist[a] ?? Infinity) ? b : a));
    settled.push(u);
    for (const { v, w } of out(u))
      if (!settled.includes(v) && (dist[u] ?? 0) + w < (dist[v] ?? Infinity)) dist[v] = (dist[u] ?? 0) + w;
    rows.push({
      label: String(rows.length + 1),
      cells: { chosen: u, ...distCells(ids, dist) },
      mark: { vertices: [...settled], edges: [], current: u },
    });
  }
  return {
    columns: [
      { key: 'chosen', label: W.cols.chosen, kind: 'vertex', rule: W.rules.dijkstraChosen },
      ...distColumns(ids, W, W.rules.dijkstraDist),
    ],
    given: {
      label: W.start,
      cells: { chosen: '—', ...distCells(ids, Object.fromEntries(ids.map((v) => [v, v === src ? 0 : Infinity]))) },
      mark: { vertices: [], edges: [], current: src },
    },
    rows,
  };
}

/**
 * Bellman-Ford: the distances after each full pass over the edges in their listed order (an update
 * is used at once in the same pass), V − 1 passes, then one more as the check for a negative cycle.
 */
export function bellmanTrace({ ids, edges, directed }: Graph, src: string, W: TraceWords): Trace {
  const dist: Record<string, number> = Object.fromEntries(ids.map((v) => [v, Infinity]));
  dist[src] = 0;
  const given = distCells(ids, dist);
  const arcs = edges.flatMap((e) => {
    const a = { u: e.u, v: e.v, w: e.w ?? 0 };
    return directed ? [a] : [a, { u: e.v, v: e.u, w: a.w }];
  });
  const rows: TraceRow[] = [];
  for (let pass = 1; pass <= ids.length; pass++) {
    let changed = false;
    for (const { u, v, w } of arcs) {
      const du = dist[u] ?? Infinity;
      if (du !== Infinity && du + w < (dist[v] ?? Infinity)) {
        dist[v] = du + w;
        changed = true;
      }
    }
    rows.push({
      label: pass < ids.length ? W.pass(pass) : W.check(pass),
      cells: { ...distCells(ids, dist), changed: changed ? 'yes' : 'no' },
      mark: { vertices: ids.filter((v) => dist[v] !== Infinity), edges: [], current: null },
    });
  }
  return {
    columns: [
      ...distColumns(ids, W, W.rules.bellmanDist),
      { key: 'changed', label: W.cols.changed, kind: 'yesno', rule: W.rules.bellmanChanged },
    ],
    given: { label: W.start, cells: { ...given, changed: '—' }, mark: { vertices: [src], edges: [], current: src } },
    rows,
  };
}

/** Prim from a start vertex: the edge added at each step (the lightest across the cut) and the total. */
export function primTrace({ ids, edges }: Graph, start: string, W: TraceWords): Trace {
  const inTree = [start];
  const tree: number[] = [];
  let total = 0;
  const rows: TraceRow[] = [];
  while (inTree.length < ids.length) {
    const crossing = edges
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.u !== e.v && inTree.includes(e.u) !== inTree.includes(e.v))
      .sort((a, b) => (a.e.w ?? 0) - (b.e.w ?? 0) || natural(edgeText(a.e.u, a.e.v), edgeText(b.e.u, b.e.v)));
    const best = crossing[0];
    if (!best) break;
    tree.push(best.i);
    total += best.e.w ?? 0;
    inTree.push(inTree.includes(best.e.u) ? best.e.v : best.e.u);
    rows.push({
      label: W.step(rows.length + 1),
      cells: { edge: edgeText(best.e.u, best.e.v), total: String(total) },
      mark: { vertices: [...inTree], edges: [...tree], current: inTree[inTree.length - 1] ?? null },
    });
  }
  return {
    columns: [
      { key: 'edge', label: W.cols.edge, kind: 'edge', rule: W.rules.primEdge },
      { key: 'total', label: W.cols.total, kind: 'number', rule: W.rules.total },
    ],
    given: { label: W.start, cells: { edge: '—', total: '0' }, mark: { vertices: [start], edges: [], current: start } },
    rows,
  };
}

/**
 * Kruskal: the edges in order of weight (ties in their listed order), each accepted or rejected,
 * and the total, until the tree has V − 1 edges.
 */
export function kruskalTrace({ ids, edges }: Graph, W: TraceWords): Trace {
  const order = edges
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.u !== e.v)
    .sort((a, b) => (a.e.w ?? 0) - (b.e.w ?? 0) || a.i - b.i);
  const parent = new Map(ids.map((v) => [v, v]));
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    return p === x ? x : find(p);
  };
  const tree: number[] = [];
  let total = 0;
  const rows: TraceRow[] = [];
  for (const { e, i } of order) {
    if (tree.length === ids.length - 1) break;
    const [ru, rv] = [find(e.u), find(e.v)];
    const accept = ru !== rv;
    if (accept) {
      parent.set(ru, rv);
      tree.push(i);
      total += e.w ?? 0;
    }
    rows.push({
      label: W.step(rows.length + 1),
      cells: { edge: edgeText(e.u, e.v), decision: accept ? 'accept' : 'reject', total: String(total) },
      mark: {
        vertices: [...new Set(tree.flatMap((t) => [edges[t]?.u ?? '', edges[t]?.v ?? '']))],
        edges: [...tree],
        current: null,
      },
    });
  }
  return {
    columns: [
      { key: 'edge', label: W.cols.edge, kind: 'edge', rule: W.rules.kruskalEdge },
      { key: 'decision', label: W.cols.decision, kind: 'decision', rule: W.rules.kruskalDecision },
      { key: 'total', label: W.cols.total, kind: 'number', rule: W.rules.total },
    ],
    given: {
      label: W.start,
      cells: { edge: '—', decision: '—', total: '0' },
      mark: { vertices: [], edges: [], current: null },
    },
    rows,
  };
}

/**
 * Kahn: the vertex taken from the front of the queue and the queue after it. Vertices enter the
 * queue in the order of the vertex list, both at the start and when their in-degree reaches 0.
 */
export function kahnTrace({ ids, edges }: Graph, W: TraceWords): Trace {
  const indeg = new Map(ids.map((v) => [v, 0]));
  for (const e of edges) indeg.set(e.v, (indeg.get(e.v) ?? 0) + 1);
  const queue = ids.filter((v) => indeg.get(v) === 0);
  const show = (q: string[]) => (q.length ? q.join(', ') : EMPTY_TEXT);
  const given = show(queue);
  const placed: string[] = [];
  const rows: TraceRow[] = [];
  while (queue.length) {
    const u = queue.shift() as string;
    placed.push(u);
    const next = edges
      .filter((e) => e.u === u)
      .map((e) => e.v)
      .sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
    for (const v of next) {
      indeg.set(v, (indeg.get(v) ?? 0) - 1);
      if (indeg.get(v) === 0) queue.push(v);
    }
    rows.push({
      label: W.step(rows.length + 1),
      cells: { removed: u, queue: show(queue) },
      mark: { vertices: [...placed], edges: edges.flatMap((e, i) => (placed.includes(e.u) ? [i] : [])), current: u },
    });
  }
  return {
    columns: [
      { key: 'removed', label: W.cols.removed, kind: 'vertex', rule: W.rules.kahnRemoved },
      { key: 'queue', label: W.cols.queue, kind: 'list', rule: W.rules.kahnQueue },
    ],
    given: { label: W.start, cells: { removed: '—', queue: given }, mark: { vertices: [], edges: [], current: null } },
    rows,
  };
}

/** Floyd-Warshall: the whole matrix D after each k. */
export function floydTrace({ ids, edges, directed }: Graph, W: TraceWords): Trace {
  const n = ids.length;
  const at = (v: string) => ids.indexOf(v);
  const D = ids.map((_, i) => ids.map((_, j) => (i === j ? 0 : Infinity)));
  for (const e of edges) {
    const [i, j, w] = [at(e.u), at(e.v), e.w ?? 0];
    const row = D[i];
    if (row && w < (row[j] ?? Infinity)) row[j] = w;
    const back = D[j];
    if (!directed && back && w < (back[i] ?? Infinity)) back[i] = w;
  }
  const cells = () =>
    Object.fromEntries(ids.flatMap((a, i) => ids.map((b, j) => [`${a},${b}`, fmt(D[i]?.[j] ?? Infinity)])));
  const given = cells();
  const rows: TraceRow[] = [];
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const through = (D[i]?.[k] ?? Infinity) + (D[k]?.[j] ?? Infinity);
        const row = D[i];
        if (row && through < (row[j] ?? Infinity)) row[j] = through;
      }
    rows.push({ label: W.k(ids[k] ?? ''), cells: cells(), mark: { vertices: [], edges: [], current: ids[k] ?? null } });
  }
  return {
    columns: [{ key: 'D', label: 'D', kind: 'number', rule: W.rules.floyd }],
    given: { label: W.start, cells: given, mark: { vertices: [], edges: [], current: null } },
    rows,
    matrix: ids,
  };
}

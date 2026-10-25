import { describe, expect, it } from 'vitest';
import {
  bellmanTrace,
  dijkstraTrace,
  firstWrong,
  floydTrace,
  kahnTrace,
  kruskalTrace,
  normalize,
  primTrace,
} from '../../src/viz/algorithms/trace';
import { TRACE_TEXT } from '../../src/viz/algorithms/trace.text';
import type { GEdge } from '../../src/viz/kit/GraphCanvas';

// Trace tables (#150): the tables the class problems ask for, as the algorithms fill them, and how
// a student's writing is read. The expected answers are the ones worked out by hand in the labs.

const W = TRACE_TEXT.sq.words;
const edges = (list: [string, string, number?][]): GEdge[] => list.map(([u, v, w]) => ({ u, v, w }));
const lab5 = edges([
  ['A', 'B', 6],
  ['A', 'C', 1],
  ['B', 'C', 5],
  ['B', 'D', 3],
  ['C', 'D', 4],
  ['C', 'E', 2],
  ['D', 'E', 8],
]);

describe('trace tables', () => {
  it('Lab 7, Problem 1: Dijkstra from A settles A, B, C, D, E, F (D before E on the tie)', () => {
    const t = dijkstraTrace(
      {
        ids: [...'ABCDEF'],
        directed: true,
        edges: edges([
          ['A', 'B', 4],
          ['A', 'C', 6],
          ['B', 'C', 2],
          ['B', 'D', 3],
          ['C', 'E', 1],
          ['D', 'E', 1],
          ['D', 'F', 7],
          ['E', 'F', 2],
        ]),
      },
      'A',
      W,
    );
    expect(t.rows.map((r) => r.cells.chosen)).toEqual([...'ABCDEF']);
    expect(t.rows.at(-1)?.cells).toMatchObject({
      'd:A': '0',
      'd:B': '4',
      'd:C': '6',
      'd:D': '7',
      'd:E': '7',
      'd:F': '9',
    });
    expect(t.given.cells['d:B']).toBe('∞');
  });

  it('Lab 7, Problem 2: Bellman-Ford still changes in the check pass (negative cycle)', () => {
    const t = bellmanTrace(
      {
        ids: [...'ABCD'],
        directed: true,
        edges: edges([
          ['A', 'B', 1],
          ['B', 'C', -4],
          ['B', 'D', 2],
          ['C', 'D', -1],
          ['D', 'A', 3],
        ]),
      },
      'A',
      W,
    );
    expect(t.rows.map((r) => r.label)).toEqual(['Kalimi 1', 'Kalimi 2', 'Kalimi 3', 'Kalimi 4 (kontroll)']);
    expect(t.rows[0]?.cells).toMatchObject({ 'd:A': '-1', 'd:B': '1', 'd:C': '-3', 'd:D': '-4' });
    expect(t.rows.at(-1)?.cells.changed).toBe('yes');
  });

  it('Lab 5, Problems 2 and 3: Kruskal and Prim reach weight 10', () => {
    const k = kruskalTrace({ ids: [...'ABCDE'], edges: lab5, directed: false }, W);
    expect(k.rows.map((r) => [r.cells.edge, r.cells.decision, r.cells.total])).toEqual([
      ['A–C', 'accept', '1'],
      ['C–E', 'accept', '3'],
      ['B–D', 'accept', '6'],
      ['C–D', 'accept', '10'],
    ]);
    const p = primTrace({ ids: [...'ABCDE'], edges: lab5, directed: false }, 'A', W);
    expect(p.rows.map((r) => [r.cells.edge, r.cells.total])).toEqual([
      ['A–C', '1'],
      ['C–E', '3'],
      ['C–D', '7'],
      ['B–D', '10'],
    ]);
  });

  it('Lab 6: Kahn takes the courses in the traced order, with the queue after each', () => {
    const ids = ['MAT1', 'MAT2', 'PRG1', 'ALG1', 'PRG2', 'OS', 'DB', 'NET'];
    const t = kahnTrace(
      {
        ids,
        directed: true,
        edges: edges([
          ['MAT1', 'MAT2'],
          ['MAT2', 'ALG1'],
          ['ALG1', 'DB'],
          ['DB', 'NET'],
          ['MAT1', 'PRG1'],
          ['PRG1', 'PRG2'],
          ['PRG2', 'OS'],
          ['OS', 'DB'],
          ['PRG2', 'NET'],
        ]),
      },
      W,
    );
    expect(t.given.cells.queue).toBe('MAT1');
    expect(t.rows.map((r) => r.cells.removed)).toEqual(ids);
    expect(t.rows.slice(0, 2).map((r) => r.cells.queue)).toEqual(['MAT2, PRG1', 'PRG1, ALG1']);
    expect(t.rows.at(-1)?.cells.queue).toBe('∅');
  });

  it('Lab 8: Floyd-Warshall by hand, the matrix after each k', () => {
    const t = floydTrace(
      {
        ids: ['0', '1', '2', '3'],
        directed: true,
        edges: edges([
          ['0', '1', 3],
          ['0', '3', 7],
          ['1', '0', 8],
          ['1', '2', 2],
          ['2', '0', 5],
          ['2', '3', 1],
          ['3', '0', 2],
        ]),
      },
      W,
    );
    expect(t.given.cells['0,2']).toBe('∞');
    expect(t.rows).toHaveLength(4);
    // After k = 0, 3 → 0 → 1 gives D[3][1] = 5; at the end 1 → 2 → 3 gives D[1][3] = 3.
    expect(t.rows[0]?.cells['3,1']).toBe('5');
    expect(t.rows.at(-1)?.cells['1,3']).toBe('3');
  });

  it("reads a student's writing in each column's form", () => {
    const ids = [...'ABCDE'];
    expect(normalize('number', ' inf ', ids)).toBe('∞');
    expect(normalize('number', '−3', ids)).toBe('-3');
    expect(normalize('edge', 'c-a', ids)).toBe('A–C');
    expect(normalize('edge', 'AC', ids)).toBe('A–C');
    expect(normalize('edge', 'A', ids)).toBeNull();
    expect(normalize('vertex', 'b', ids)).toBe('B');
    expect(normalize('vertex', 'Z', ids)).toBeNull();
    expect(normalize('decision', 'Pranohet', ids)).toBe('accept');
    expect(normalize('decision', 'refuzohet', ids)).toBe('reject');
    expect(normalize('yesno', 'Po', ids)).toBe('yes');
    expect(normalize('list', 'mat2 prg1', ['MAT2', 'PRG1'])).toBe('MAT2, PRG1');
    expect(normalize('list', '-', ids)).toBe('∅');
  });

  it('points to the first wrong cell of a row, in column order', () => {
    const t = primTrace({ ids: [...'ABCDE'], edges: lab5, directed: false }, 'A', W);
    const row = t.rows[1];
    if (!row) throw new Error('Prim has a second step');
    expect(firstWrong(t, row, { edge: 'E-C', total: '3' }, [...'ABCDE'])).toBeNull();
    expect(firstWrong(t, row, { edge: 'B-C', total: '6' }, [...'ABCDE'])?.key).toBe('edge');
    expect(firstWrong(t, row, { edge: 'C-E', total: '2' }, [...'ABCDE'])?.key).toBe('total');
  });
});

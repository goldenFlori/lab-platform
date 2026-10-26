import { describe, expect, it } from 'vitest';
import { problemIssue, type TraceProblem } from '../../src/shared/trace-problem';
import { traceOf } from '../../src/viz/algorithms/trace';
import { TRACE_TEXT } from '../../src/viz/algorithms/trace.text';
import { TRACE_PRESET_IDS, TRACE_PRESETS } from '../../src/viz/algorithms/trace-presets';

// A pedagog's own trace problem (#166): the rules the API and the builder share, and the course's
// presets as problems of the same kind, traced to the answers worked out by hand.

const W = TRACE_TEXT.sq.words;
const prim = TRACE_PRESETS['lab05-prim'];
const change = (over: Partial<TraceProblem>): TraceProblem => ({ ...prim, ...over });

describe('trace problems', () => {
  it('the course presets follow the rules and keep their answers', () => {
    for (const id of TRACE_PRESET_IDS) expect(problemIssue(TRACE_PRESETS[id]), id).toBeNull();
    expect(traceOf(prim, W).rows.at(-1)?.cells.total).toBe('10');
    expect(traceOf(TRACE_PRESETS['lab05-kruskal'], W).rows.map((r) => r.cells.edge)).toEqual([
      'A–C',
      'C–E',
      'B–D',
      'C–D',
    ]);
    expect(traceOf(TRACE_PRESETS['lab06-kahn'], W).rows[0]?.cells.queue).toBe('MAT2, PRG1');
    expect(traceOf(TRACE_PRESETS['lab07-dijkstra'], W).rows.map((r) => r.cells.chosen)).toEqual([...'ABCDEF']);
    expect(traceOf(TRACE_PRESETS['lab07-bellman'], W).rows.at(-1)?.cells.changed).toBe('yes');
    expect(traceOf(TRACE_PRESETS['lab08-floyd'], W).rows.at(-1)?.cells['1,3']).toBe('3');
  });

  it("traces a pedagog's own graph", () => {
    const own: TraceProblem = {
      algorithm: 'dijkstra',
      directed: false,
      nodes: [
        { id: 'X', x: 100, y: 100 },
        { id: 'Y', x: 300, y: 100 },
        { id: 'Z', x: 200, y: 300 },
      ],
      edges: [
        { u: 'X', v: 'Y', w: 5 },
        { u: 'X', v: 'Z', w: 1 },
        { u: 'Z', v: 'Y', w: 2 },
      ],
      source: 'X',
    };
    expect(problemIssue(own)).toBeNull();
    const rows = traceOf(own, W).rows;
    expect(rows.map((r) => r.cells.chosen)).toEqual(['X', 'Z', 'Y']);
    expect(rows.at(-1)?.cells).toMatchObject({ 'd:X': '0', 'd:Y': '3', 'd:Z': '1' });
  });

  it('names the first rule a problem breaks', () => {
    const node = (id: string) => ({ id, x: 100, y: 100 });
    expect(problemIssue(null)).toBe('shape');
    expect(problemIssue({ ...prim, algorithm: 'sort' })).toBe('shape');
    expect(problemIssue(change({ nodes: [node('A')], edges: [] }))).toBe('nodes');
    expect(
      problemIssue(change({ algorithm: 'floyd', directed: true, source: null, nodes: [...'ABCDEFG'].map(node) })),
    ).toBe('nodes');
    expect(problemIssue(change({ nodes: [node('A'), node('A')] }))).toBe('ids');
    expect(problemIssue(change({ nodes: [node('A'), node('too-long')] }))).toBe('ids');
    expect(problemIssue(change({ nodes: [{ id: 'A', x: 9999, y: 1 }, node('B')] }))).toBe('shape');
    expect(problemIssue(change({ edges: [] }))).toBe('edges');
    expect(problemIssue(change({ edges: [{ u: 'A', v: 'Q', w: 1 }] }))).toBe('endpoint');
    expect(problemIssue(change({ edges: [{ u: 'A', v: 'A', w: 1 }] }))).toBe('loop');
    expect(
      problemIssue(
        change({
          edges: [
            { u: 'A', v: 'B', w: 1 },
            { u: 'B', v: 'A', w: 2 },
          ],
        }),
      ),
    ).toBe('duplicate');
    expect(problemIssue(change({ edges: [{ u: 'A', v: 'B', w: 1.5 }] }))).toBe('weight');
    expect(problemIssue(change({ edges: [{ u: 'A', v: 'B', w: 100 }] }))).toBe('weight');
    expect(problemIssue(change({ algorithm: 'dijkstra', edges: [{ u: 'A', v: 'B', w: -1 }] }))).toBe('negative');
    expect(problemIssue(change({ directed: true }))).toBe('direction');
    expect(problemIssue(change({ source: null }))).toBe('source');
    expect(problemIssue(change({ source: 'Q' }))).toBe('source');
    expect(problemIssue(change({ algorithm: 'kruskal' }))).toBe('source');
    // A directed graph may have both A → B and B → A.
    expect(
      problemIssue({
        ...TRACE_PRESETS['lab08-floyd'],
        edges: [
          { u: '0', v: '1', w: 1 },
          { u: '1', v: '0', w: 1 },
        ],
      }),
    ).toBeNull();
  });
});

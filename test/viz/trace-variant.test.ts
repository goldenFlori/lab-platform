import { describe, expect, it } from 'vitest';
import {
  problemIssue,
  TRACE_ALGORITHMS,
  type TraceVariant,
  VARIANT_SIZES,
  variantIssue,
  variantProblem,
  variantSeed,
} from '../../src/shared/trace-problem';
import { traceOf } from '../../src/viz/algorithms/trace';
import { TRACE_TEXT } from '../../src/viz/algorithms/trace.text';

// A trace problem per student (#167): every variant can be traced, the same student always gets the
// same one, and two students rarely share it.

const W = TRACE_TEXT.sq.words;

const specs: TraceVariant[] = TRACE_ALGORITHMS.flatMap((algorithm) => {
  const [least, most] = VARIANT_SIZES[algorithm === 'floyd' ? 'floyd' : 'other'];
  const sizes = Array.from({ length: most - least + 1 }, (_, i) => least + i);
  const directions =
    algorithm === 'prim' || algorithm === 'kruskal' ? [false] : algorithm === 'kahn' ? [true] : [true, false];
  return sizes.flatMap((nodes) => directions.map((directed) => ({ algorithm, nodes, directed })));
});

describe('trace variants', () => {
  it('make a problem that follows the rules, for every algorithm, size and seed', () => {
    for (const spec of specs) {
      expect(variantIssue(spec), JSON.stringify(spec)).toBeNull();
      for (let s = 0; s < 200; s++) {
        const p = variantProblem(spec, variantSeed(`student-${s}`, 'nb', 3));
        expect(problemIssue(p), `${JSON.stringify(spec)} seed ${s}`).toBeNull();
        expect(p.nodes).toHaveLength(spec.nodes);
        const trace = traceOf(p, W);
        // Every vertex is reached from A where the algorithm starts there, and no negative cycle.
        if (spec.algorithm === 'dijkstra' || spec.algorithm === 'prim') {
          expect(trace.rows, `${JSON.stringify(spec)} seed ${s}`).toHaveLength(
            spec.nodes - (spec.algorithm === 'prim' ? 1 : 0),
          );
        }
        if (spec.algorithm === 'bellman') expect(trace.rows.at(-1)?.cells.changed).toBe('no');
        if (spec.algorithm === 'kahn') expect(trace.rows).toHaveLength(spec.nodes);
      }
    }
  });

  it('give the same student the same problem, and different students different ones', () => {
    const spec: TraceVariant = { algorithm: 'kruskal', nodes: 6, directed: false };
    const ana = variantProblem(spec, variantSeed('ana', 'nb', 3));
    expect(variantProblem(spec, variantSeed('ana', 'nb', 3))).toEqual(ana);
    expect(variantProblem(spec, variantSeed('ana', 'nb', 4))).not.toEqual(ana);
    const graphs = new Set(
      Array.from({ length: 50 }, (_, s) => JSON.stringify(variantProblem(spec, variantSeed(`s${s}`, 'nb', 3)).edges)),
    );
    expect(graphs.size).toBeGreaterThanOrEqual(48);
  });

  it('refuse a variant they cannot make', () => {
    expect(variantIssue({ algorithm: 'prim', nodes: 9, directed: false })).toBe('nodes');
    expect(variantIssue({ algorithm: 'floyd', nodes: 6, directed: true })).toBe('nodes');
    expect(variantIssue({ algorithm: 'kahn', nodes: 5, directed: false })).toBe('direction');
    expect(variantIssue({ algorithm: 'prim', nodes: 5 })).toBe('shape');
  });
});

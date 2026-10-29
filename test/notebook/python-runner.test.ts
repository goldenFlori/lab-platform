import { loadPyodide, type PyodideAPI } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { cellFile, MICROPIP_PACKAGES, RUNNER_PY } from '../../src/web/python/runner';

// The Python side of running cells (#47), in Pyodide under Node: what the page shows after a run.

let pyodide: PyodideAPI;
let printed: string[];
const vizlabSent: string[] = [];

beforeAll(async () => {
  pyodide = await loadPyodide();
  pyodide.setStdout({ batched: (text) => printed.push(text) });
  pyodide.registerJsModule('_lab_display', {
    image: () => {},
    plotly: () => {},
    vizlab: (json: string) => vizlabSent.push(json),
  });
  await pyodide.runPythonAsync(RUNNER_PY);
}, 60_000);

async function run(code: string, cell = 0) {
  printed = [];
  const result = await pyodide.globals.get('_lab_run')(code, cellFile(cell));
  const [kind, text = null] = result.toJs() as [string, string | undefined];
  result.destroy();
  return { kind, text, printed };
}

describe('running a cell', () => {
  it('shares one namespace between cells and shows the last expression, as Jupyter does', async () => {
    expect(await run('x = 21\nprint("gati")')).toEqual({ kind: 'ok', text: null, printed: ['gati'] });
    expect(await run('x * 2', 1)).toMatchObject({ kind: 'ok', text: '42' });
    expect(await run('"tekst"', 2)).toMatchObject({ kind: 'ok', text: "'tekst'" });
    expect(await run('y = x', 3)).toMatchObject({ kind: 'ok', text: null });
  });

  it("names the student's cell in a traceback and leaves out Pyodide's frames", async () => {
    const { kind, text } = await run('def f():\n    return 1 / 0\n\nf()', 4);
    expect(kind).toBe('error');
    expect(text).toContain('File "<cell 5>", line 4');
    expect(text).toContain('File "<cell 5>", line 2, in f');
    expect(text).toContain('ZeroDivisionError: division by zero');
    expect(text).not.toMatch(/_pyodide|eval_code_async/);
  });

  it('reports a syntax error with its line', async () => {
    const { kind, text } = await run('for i in range(3)\n    print(i)', 5);
    expect(kind).toBe('error');
    expect(text).toContain('<cell 6>');
    expect(text).toContain('SyntaxError');
  });
});

async function check(code: string, test: string | null = null) {
  printed = [];
  const result = await pyodide.globals.get('_lab_run')(code, cellFile(9), true, test);
  const [kind, text = null, checked = null] = result.toJs() as [string, string | undefined, string[] | undefined];
  result.destroy();
  return { kind, text, check: checked, printed };
}

describe('checking an exercise (#51)', () => {
  const tests = (body: string) => `def _testet():\n${body}\n\nkontrollo("Ushtrimi 1", _testet)`;

  it("runs the cell's kontrollo(…) call: passed, failed with its message, not written yet, or an error", async () => {
    await run('def shuma(a, b):\n    raise NotImplementedError');
    expect((await check(tests('    assert shuma(1, 2) == 3, "shuma(1, 2) duhet 3"'))).check).toEqual(['todo', '']);
    await run('def shuma(a, b):\n    return a - b');
    expect((await check(tests('    assert shuma(1, 2) == 3, "shuma(1, 2) duhet 3"'))).check).toEqual([
      'fail',
      'shuma(1, 2) duhet 3',
    ]);
    await run('def shuma(a, b):\n    return a + b');
    expect(await check(tests('    assert shuma(1, 2) == 3\n    print("   tre")'))).toEqual({
      kind: 'ok',
      text: null,
      check: ['pass', ''],
      printed: ['   tre'],
    });
    expect((await check(tests('    assert prodhimi(2, 3) == 6'))).check).toEqual([
      'error',
      "NameError: name 'prodhimi' is not defined",
    ]);
  });

  it("puts the notebook's own kontrollo back afterwards, and the first check that failed speaks for a cell", async () => {
    await run('def kontrollo(titulli, testet):\n    print("e fletores")');
    const both = `${tests('    assert True')}\n${tests('    assert False, "jo"')}`;
    expect((await check(both)).check).toEqual(['fail', 'jo']);
    expect((await run('kontrollo("x", None)')).printed).toEqual(['e fletores']);
  });

  it('runs a visible test after the cell, in its namespace', async () => {
    expect((await check('def prodhimi(a, b):\n    return a * b', 'assert prodhimi(2, 3) == 6')).check).toEqual([
      'pass',
      '',
    ]);
    expect(
      (await check('def prodhimi(a, b):\n    return a + b', 'assert prodhimi(2, 3) == 6, "prodhimi(2, 3) duhet 6"'))
        .check,
    ).toEqual(['fail', 'prodhimi(2, 3) duhet 6']);
    // The cell's own error comes first, and nothing is checked.
    const broken = await check('def prodhimi(a, b)\n    return a * b', 'assert True');
    expect(broken.kind).toBe('error');
    expect(broken.check).toBeNull();
  });

  it("finds the source of a cell's functions, as checks that look for an assert need", async () => {
    await run('def f(a):\n    assert a\n    return a', 7);
    const looks = tests('    import inspect\n    assert "assert" in inspect.getsource(f), "shtoni assert-in"');
    expect((await check(looks)).check).toEqual(['pass', '']);
  });

  it('checks nothing for a run that is not an exercise', async () => {
    await run('del kontrollo');
    const result = await pyodide.globals.get('_lab_run')(tests('    assert True'), cellFile(9));
    const [kind, , checked] = result.toJs() as [string, string | undefined, unknown];
    result.destroy();
    expect(kind).toBe('error');
    expect(checked).toBeUndefined();
  });
});

describe('vizlab (#69)', () => {
  it("records what a student's sort does to a tracked list, and sends it when the cell ends", async () => {
    const sent = vizlabSent;
    sent.length = 0;
    await run(
      [
        'import vizlab',
        'A = vizlab.track([3, 1, 2])',
        'vizlab.compare(0, 1)',
        'vizlab.swap(0, 1)',
        'A[2] = 5',
        'vizlab.done(0)',
      ].join('\n'),
    );
    expect(sent).toHaveLength(1);
    const { kind, events } = JSON.parse(sent[0] ?? '{}') as { kind: string; events: { op: string; arr: number[] }[] };
    expect(kind).toBe('sorting');
    expect(events.map((e) => [e.op, e.arr])).toEqual([
      ['start', [3, 1, 2]],
      ['compare', [3, 1, 2]],
      ['swap', [1, 3, 2]],
      ['write', [1, 3, 5]],
      ['done', [1, 3, 5]],
    ]);
    // Nothing is sent from a cell that does not track a list.
    await run('x = 1');
    expect(sent).toHaveLength(1);
    const { kind: error, text } = await run('import vizlab\nvizlab.compare(0, 9)');
    expect(error).toBe('error');
    expect(text).toContain('vizlab');
  });
});

describe('vizlab on graphs (#70)', () => {
  it('records a graph and what a traversal does on it', async () => {
    vizlabSent.length = 0;
    await run(
      [
        'import vizlab',
        "G = vizlab.graph({'A': {'B': 2, 'C': 5}, 'B': {'C': 1}, 'C': {}})",
        "vizlab.visit('A')",
        "vizlab.relax('A', 'B', 2)",
        "vizlab.mark(('A', 'B'))",
      ].join('\n'),
    );
    const sent = JSON.parse(vizlabSent[0] ?? '{}') as { kind: string; events: Record<string, unknown>[] };
    expect(sent.kind).toBe('graph');
    expect(sent.events).toEqual([
      {
        op: 'graph',
        nodes: ['A', 'B', 'C'],
        edges: [
          ['A', 'B', 2],
          ['A', 'C', 5],
          ['B', 'C', 1],
        ],
        directed: false,
      },
      { op: 'visit', node: 'A' },
      { op: 'relax', u: 'A', v: 'B', dist: 2 },
      { op: 'mark', u: 'A', v: 'B', state: 'tree' },
    ]);
  });
});

describe('packages Pyodide does not ship', () => {
  it('finds plotly in any import of a line, and not elsewhere', () => {
    const plotly = MICROPIP_PACKAGES.plotly as RegExp;
    for (const code of [
      'import plotly',
      'import plotly.express as px',
      'from plotly import graph_objects',
      'import numpy, plotly',
      'import numpy as np, matplotlib.pyplot as plt, plotly.express',
      'x = 1\n  import plotly',
    ]) {
      expect(plotly.test(code), code).toBe(true);
    }
    for (const code of ['import plotlyx', '# import plotly is not needed', 'print("import plotly")', 'import numpy']) {
      expect(plotly.test(code), code).toBe(false);
    }
  });
});

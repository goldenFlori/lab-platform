import { loadPyodide, type PyodideAPI } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { cellFile, RUNNER_PY } from '../../src/web/python/runner';

// The Python side of running cells (#47), in Pyodide under Node: what the page shows after a run.

let pyodide: PyodideAPI;
let printed: string[];

beforeAll(async () => {
  pyodide = await loadPyodide();
  pyodide.setStdout({ batched: (text) => printed.push(text) });
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

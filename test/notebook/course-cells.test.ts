import { loadPyodide, type PyodideAPI } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderNotebook } from '../../src/notebook';
import { cellFile, MICROPIP_PACKAGES, RUNNER_PY } from '../../src/web/python/runner';

// #48 is done when every course notebook's runnable cells run in the browser with their figures.
// This runs them all through the same runner the browser uses, in Pyodide under Node: each notebook
// in a fresh namespace, the desktop-window cells skipped as on the lab page. The packages come from
// Pyodide's CDN and PyPI, as in the browser, so this test needs the network.

const notebooks = import.meta.glob<string>('./fixtures/notebooks/*.ipynb', {
  query: '?raw',
  import: 'default',
  eager: true,
});

let pyodide: PyodideAPI;
const shown = { images: 0, plotly: 0 };
const installed = new Set<string>();

beforeAll(async () => {
  pyodide = await loadPyodide();
  pyodide.setStdout({ batched: () => {} });
  pyodide.setStderr({ batched: () => {} });
  pyodide.setStdin({ stdin: () => '' });
  pyodide.registerJsModule('_lab_display', {
    image: () => {
      shown.images++;
    },
    plotly: () => {
      shown.plotly++;
    },
  });
  await pyodide.runPythonAsync(RUNNER_PY);
}, 120_000);

async function runAll(raw: string) {
  pyodide.runPython('_lab_namespace.clear(); _lab_namespace["__name__"] = "__main__"');
  shown.images = 0;
  shown.plotly = 0;
  const failures: string[] = [];
  // Figures each runnable cell should show: a Plotly fig.show(), a matplotlib plt.show().
  const expected = { images: 0, plotly: 0 };
  const cells = (await renderNotebook(raw)).cells.filter((cell) => cell.type === 'code');
  for (const [i, cell] of cells.entries()) {
    if (cell.type !== 'code' || cell.interactive) continue;
    await pyodide.loadPackagesFromImports(cell.raw);
    for (const [name, pattern] of Object.entries(MICROPIP_PACKAGES)) {
      if (installed.has(name) || !pattern.test(cell.raw)) continue;
      await pyodide.loadPackage('micropip');
      await pyodide.pyimport('micropip').install(name);
      installed.add(name);
    }
    const result = await pyodide.globals.get('_lab_run')(cell.raw, cellFile(i));
    const [kind, text = ''] = result.toJs() as [string, string | undefined];
    result.destroy();
    if (/plotly/.test(cell.raw) && /fig\.show\(\)/.test(cell.raw)) expected.plotly++;
    if (/plt\.show\(\)/.test(cell.raw)) expected.images++;
    if (kind !== 'ok') failures.push(`${cellFile(i)}: ${text.trim().split('\n').at(-1)}`);
  }
  return { failures, expected, shown: { ...shown } };
}

const name = (path: string) => path.split('/').pop() as string;

describe('every course notebook in the browser runtime', () => {
  it.each(Object.entries(notebooks).map(([path, raw]) => [name(path), raw]))(
    '%s runs, its figures shown',
    async (file, raw) => {
      const { failures, expected, shown } = await runAll(raw);
      // Exercise blanks (___) are left for students to fill in; nothing else may fail.
      expect(
        failures.filter((f) => !f.includes("name '___' is not defined")),
        file,
      ).toEqual([]);
      expect(shown.plotly, file).toBe(expected.plotly);
      // Some plt.show() calls sit in helpers that run only once an exercise is solved.
      if (expected.images > 0) expect(shown.images, file).toBeGreaterThan(0);
    },
    120_000,
  );
});

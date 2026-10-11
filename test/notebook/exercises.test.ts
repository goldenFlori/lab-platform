import { describe, expect, it } from 'vitest';
import { renderNotebook } from '../../src/notebook';
import { detectExercises } from '../../src/notebook/exercises';
import { toStored } from '../../src/notebook/stored';

// #51: the course notebooks' own checks become exercises.

const notebooks = import.meta.glob<string>('./fixtures/notebooks/*.ipynb', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const byName = new Map(Object.entries(notebooks).map(([path, raw]) => [path.split('/').pop() as string, raw]));

const detect = async (name: string) => detectExercises(toStored(await renderNotebook(byName.get(name) ?? '')));

describe('exercises a notebook checks itself', () => {
  it('finds each kontrollo(…) cell, titled by its call', async () => {
    const found = await detect('laborator-01-ushtrime-shtese.ipynb');
    expect(found.map((e) => e.title)).toEqual([
      'Ushtrimi 2 — HI si assert',
      'Ushtrimi 3 — Kundërshembulli',
      'Ushtrimi 4 — Inputi më i keq',
      'Ushtrimi 5 — HI e Selection Sort',
    ]);
    expect(found.every((e) => e.test === null)).toBe(true);
    expect(found.map((e) => e.cell)).toEqual([8, 14, 18, 23]);
  });

  // One test per notebook: together they take longer than a test may on a slow machine.
  const CHECKS: Record<string, number> = {
    'laborator-01-ushtrime-shtese.ipynb': 4,
    'laborator-02-ushtrime-shtese.ipynb': 4,
    'laborator-03-ushtrime-shtese.ipynb': 3,
    'laborator-04-ushtrime-shtese.ipynb': 8,
    'laborator-09-ushtrime-shtese.ipynb': 7,
    'laborator-10.ipynb': 3,
  };
  it.each([...byName.keys()])('finds every check of %s, and none where there is none', async (name) => {
    expect(await detect(name)).toHaveLength(CHECKS[name] ?? 0);
  });

  it('ignores the helper that defines kontrollo and mentions of it', async () => {
    const nb = toStored(
      await renderNotebook(
        JSON.stringify({
          cells: [
            { cell_type: 'code', source: 'def kontrollo(titulli, testet):\n    testet()' },
            { cell_type: 'code', source: '# kontrollo("jo", f) është në koment\nx = 1' },
            { cell_type: 'code', source: "def _t():\n    assert True\n\nkontrollo('Ushtrimi 1', _t)" },
          ],
          nbformat: 4,
        }),
      ),
    );
    expect(detectExercises(nb)).toEqual([{ cell: 2, title: 'Ushtrimi 1', test: null }]);
  });
});

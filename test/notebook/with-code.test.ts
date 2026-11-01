import { describe, expect, it } from 'vitest';
import { ipynbNamed, withCode } from '../../src/notebook/with-code';

// #214: a student's notebook with their own code, as an .ipynb that Jupyter and Colab open.

const raw = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: ['# Lab\n', 'tekst'] },
    {
      cell_type: 'code',
      source: ['x = 1\n', 'print(x)'],
      outputs: [{ output_type: 'stream', text: '1' }],
      execution_count: 3,
    },
    { cell_type: 'code', source: 'y = 2', outputs: [], execution_count: 4 },
  ],
  metadata: { kernelspec: { name: 'python3' } },
  nbformat: 4,
  nbformat_minor: 5,
});

describe('a notebook with my code', () => {
  it('puts the code in its cells, without the outputs of the old code, and keeps the rest', () => {
    const nb = JSON.parse(withCode(raw, new Map([[1, 'x = 10\nprint(x * 2)\n']])));
    expect(nb.cells[1]).toEqual({
      cell_type: 'code',
      source: ['x = 10\n', 'print(x * 2)\n'],
      outputs: [],
      execution_count: null,
    });
    expect(nb.cells[0]).toEqual({ cell_type: 'markdown', source: ['# Lab\n', 'tekst'] });
    expect(nb.cells[2]).toMatchObject({ source: 'y = 2', execution_count: 4 });
    expect(nb.metadata).toEqual({ kernelspec: { name: 'python3' } });
  });

  it('never writes code into a text cell or past the end', () => {
    const nb = JSON.parse(
      withCode(
        raw,
        new Map([
          [0, 'x'],
          [9, 'y'],
        ]),
      ),
    );
    expect(nb.cells[0].source).toEqual(['# Lab\n', 'tekst']);
    expect(nb.cells).toHaveLength(3);
  });

  it('names the file after the original', () => {
    expect(ipynbNamed('laborator-01.ipynb', 'versioni im')).toBe('laborator-01 (versioni im).ipynb');
    expect(ipynbNamed('lab.ipynb', 'Ana/Hoxha')).toBe('lab (AnaHoxha).ipynb');
  });
});

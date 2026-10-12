import { describe, expect, it } from 'vitest';
import { batches, partsOf, segmentsOf, translated } from '../../src/web/lib/translate';

// #88: a translation changes the text cells and comment lines, never the code.

const notebook = {
  cells: [
    { cell_type: 'markdown', source: ['## Renditja\n', '\n', 'Çdo element futet në vend.'] },
    {
      cell_type: 'code',
      source: '# ──────────\n# Ngjyrat e shigjetave\nx = 1  # në fund\n#!/usr/bin/env python\n    # Brenda funksionit',
      outputs: [{ output_type: 'stream', text: ['1\n'] }],
    },
  ],
  nbformat: 4,
};

describe('translating a notebook', () => {
  it('finds the text cells and the comment lines, not decoration or code', () => {
    expect(segmentsOf(notebook).map((s) => [s.cell, s.line, s.text])).toEqual([
      [0, null, '## Renditja\n\nÇdo element futet në vend.'],
      [1, 1, 'Ngjyrat e shigjetave'],
      [1, 4, 'Brenda funksionit'],
    ]);
  });

  it('puts translations back and leaves code and outputs as they were', () => {
    const segments = segmentsOf(notebook);
    const copy = JSON.parse(
      translated(notebook, segments, [
        '## Sorting\n\nEach element goes in place.',
        'Arrow\ncolours',
        'Inside the function',
      ]),
    );
    expect(copy.cells[0].source.join('')).toBe('## Sorting\n\nEach element goes in place.');
    expect(copy.cells[1].source.join('')).toBe(
      '# ──────────\n# Arrow colours\nx = 1  # në fund\n#!/usr/bin/env python\n    # Inside the function',
    );
    expect(copy.cells[1].outputs).toEqual(notebook.cells[1]?.outputs);
  });

  it('reads parts by their marks and sends long notebooks in several requests', () => {
    expect(partsOf('[[1]]\n## Sorting\n\n### Why?\n\n[[2]]\nArrows')).toEqual(
      new Map([
        [1, '## Sorting\n\n### Why?'],
        [2, 'Arrows'],
      ]),
    );
    const long = Array.from({ length: 5 }, (_, i) => ({ cell: i, line: null, prefix: '', text: 'x'.repeat(3000) }));
    expect(batches(long)).toEqual([[0, 1], [2, 3], [4]]);
  });
});

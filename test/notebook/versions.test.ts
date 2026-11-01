import { describe, expect, it } from 'vitest';
import { matchCells, notebookCells } from '../../src/notebook/versions';

// #208: the cells of a new version matched to the old ones, so students' work follows its cell.

const md = (source: string) => ({ type: 'markdown', source });
const code = (source: string) => ({ type: 'code', source });

describe('matching the cells of two versions of a notebook', () => {
  it('keeps every cell of an unchanged notebook in place', () => {
    const cells = [md('# A'), code('x = 1'), code('print(x)')];
    expect(matchCells(cells, cells)).toEqual({
      map: [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
      changed: [],
      removed: [],
      added: [],
      same: 3,
    });
  });

  it('follows cells moved by an inserted cell, and marks a fixed typo as changed', () => {
    const before = [md('# Lab'), code('def bfs(g): pas'), md('## Ushtrimi'), code('# shkruaj këtu')];
    const after = [md('# Lab'), md('Shënim i ri'), code('def bfs(g): pass'), md('## Ushtrimi'), code('# shkruaj këtu')];
    expect(matchCells(before, after)).toMatchObject({
      map: [
        [0, 0],
        [1, 2],
        [2, 3],
        [3, 4],
      ],
      changed: [[1, 2]],
      added: [1],
      removed: [],
      same: 3,
    });
  });

  it('removes what has no place, never pairing a code cell with text', () => {
    const before = [md('# A'), code('a = 1'), code('b = 2'), md('fund')];
    const after = [md('# A'), md('teksti i ri'), md('fund')];
    expect(matchCells(before, after)).toMatchObject({
      map: [
        [0, 0],
        [3, 2],
      ],
      removed: [1, 2],
      added: [1],
    });
  });

  it('pairs changed cells in order, without crossing', () => {
    const before = [code('a'), md('x'), code('b')];
    const after = [md('y'), code('c')];
    expect(matchCells(before, after)).toMatchObject({
      map: [
        [1, 0],
        [2, 1],
      ],
      removed: [0],
      added: [],
    });
  });

  it("reads an .ipynb's cells, joining source lines and ignoring trailing space", () => {
    const raw = JSON.stringify({
      cells: [
        { cell_type: 'markdown', source: ['# A\n', 'tekst'] },
        { cell_type: 'code', source: 'x = 1\n\n' },
      ],
    });
    expect(notebookCells(raw)).toEqual([md('# A\ntekst'), code('x = 1')]);
  });
});

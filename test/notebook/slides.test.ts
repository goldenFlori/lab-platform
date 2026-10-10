import { describe, expect, it } from 'vitest';
import { renderNotebook } from '../../src/notebook';
import { isSolutionOf, slidesOf } from '../../src/notebook/slides';
import { toStored } from '../../src/notebook/stored';

// Presentation mode's steps, on tiny notebooks.

type RawCell = { cell_type: string; source: string; outputs?: unknown[] };
const render = async (...cells: RawCell[]) => toStored(await renderNotebook(JSON.stringify({ cells, nbformat: 4 })));
const md = (source: string): RawCell => ({ cell_type: 'markdown', source });
const code = (source: string, outputs: unknown[] = []): RawCell => ({ cell_type: 'code', source, outputs });
const stream = (text: string) => ({ output_type: 'stream', name: 'stdout', text });

describe('presentation steps', () => {
  it('walks the cells in order: text, then code with its outputs', async () => {
    const nb = await render(md('## Hyrje\n\nPak teori.'), code('print(1)', [stream('1\n')]));
    const slides = slidesOf(nb, []);
    expect(slides.map((s) => s.kind)).toEqual(['text', 'code']);
    expect(slides[1]).toMatchObject({ kind: 'code', at: 1 });
  });

  it('shows a visualization in place of code that opens a desktop window', async () => {
    const nb = await render(md('## Labirinti'), code('import pygame\npygame.init()'), md('Pas lojës.'));
    const slides = slidesOf(nb, [{ cell: 1, viz: 'labirinti', title: null, props: null }]);
    expect(slides.map((s) => s.kind)).toEqual(['text', 'viz', 'text']);
    expect(slides[1]).toMatchObject({ kind: 'viz', at: 1, embed: { viz: 'labirinti' } });
  });

  it('puts any other visualization right after its cell', async () => {
    const nb = await render(md('## Renditja'), code('print(sorted([3, 1, 2]))'), md('Fund.'));
    const slides = slidesOf(nb, [{ cell: 1, viz: 'renditja', title: null, props: null }]);
    expect(slides.map((s) => s.kind)).toEqual(['text', 'code', 'viz', 'text']);
  });
});

describe('matching a solution notebook', () => {
  it('accepts the same cells with solved code and outputs', async () => {
    const exercise = await render(md('## Ushtrimi 1'), code('def shuma(a, b):\n    pass'));
    const solved = await render(md('## Ushtrimi 1'), code('def shuma(a, b):\n    return a + b', [stream('3\n')]));
    expect(isSolutionOf(solved, exercise)).toBe(true);
  });

  it('refuses a notebook whose text or cells differ', async () => {
    const exercise = await render(md('## Ushtrimi 1'), code('pass'));
    expect(isSolutionOf(await render(md('## Ushtrimi 2'), code('pass')), exercise)).toBe(false);
    expect(isSolutionOf(await render(md('## Ushtrimi 1'), code('pass'), code('pass')), exercise)).toBe(false);
    expect(isSolutionOf(await render(code('pass'), md('## Ushtrimi 1')), exercise)).toBe(false);
  });
});

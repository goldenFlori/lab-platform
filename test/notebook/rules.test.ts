import { describe, expect, it } from 'vitest';
import { type CodeCell, type MarkdownCell, renderNotebook } from '../../src/notebook';

// The converter's rules, one by one, on tiny notebooks. The fixtures prove it matches the course
// site; these say what it guarantees, so the guarantees survive later changes.

type RawCell = { cell_type: string; source: string; outputs?: unknown[] };
const notebook = (...cells: RawCell[]) => JSON.stringify({ cells, nbformat: 4 });
const md = (source: string): RawCell => ({ cell_type: 'markdown', source });
const code = (source: string, outputs: unknown[] = []): RawCell => ({ cell_type: 'code', source, outputs });
const stream = (text: string, name = 'stdout') => ({ output_type: 'stream', name, text });
const display = (data: Record<string, unknown>) => ({ output_type: 'display_data', data, metadata: {} });

async function codeCell(source: string, outputs: unknown[]) {
  const { cells } = await renderNotebook(notebook(code(source, outputs)));
  return cells[0] as CodeCell;
}

describe('untrusted notebooks', () => {
  it('escapes raw HTML in markdown instead of passing it through', async () => {
    const { cells } = await renderNotebook(notebook(md('Hello <script>alert(1)</script> <b>bold</b>')));
    const html = (cells[0] as MarkdownCell).html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<b>');
  });

  it('strips scripts, frames, event handlers and javascript: links from HTML outputs', async () => {
    const html =
      '<div onclick="steal()"><script>steal()</script><iframe src="x"></iframe><a href="javascript:steal()">x</a><b>ok</b></div>';
    const [output] = (await codeCell('show()', [display({ 'text/html': html })])).outputs;
    expect(output).toEqual({ kind: 'html', html: '<div><a href="#">x</a><b>ok</b></div>' });
  });

  it('never runs JavaScript outputs, and leaves them out of the page', async () => {
    const cell = await codeCell('show()', [display({ 'application/javascript': 'alert(1)' })]);
    expect(cell.outputs).toEqual([]);
  });
});

describe('clean outputs', () => {
  it('drops errors, stderr, the pygame banner and pending lines, and keeps real results', async () => {
    const cell = await codeCell('print(sorted(a))', [
      stream('pygame 2.6.1 (SDL 2.28.4, Python 3.12.0)\nHello from the pygame community.\n[1, 2, 3]\n⏳ duke pritur\n'),
      stream('warning: slow\n', 'stderr'),
      { output_type: 'error', ename: 'ValueError', evalue: 'bad', traceback: ['Traceback…'] },
    ]);
    expect(cell.outputs).toEqual([{ kind: 'stream', stream: 'stdout', text: '[1, 2, 3]', truncated: false }]);
  });

  it.each([
    ['import pygame', 'pygame'],
    ['import tkinter as tk', 'tkinter'],
    ['subprocess.run(["python", "lojë.py"])', 'subprocess'],
    ['import ipywidgets as w', 'widgets'],
  ])('keeps no output for a %s cell: its interactive version is a visualizer', async (source, flag) => {
    const cell = await codeCell(source, [stream('window opened\n')]);
    expect(cell.interactive).toBe(true);
    expect(cell.flags[flag as keyof CodeCell['flags']]).toBe(true);
    expect(cell.outputs).toEqual([]);
  });

  it('turns images into assets named by their content, and keeps each cell’s source index', async () => {
    const png = btoa('not really a png');
    const { cells, assets } = await renderNotebook(
      notebook(md('# Titulli'), code('plot()', [display({ 'image/png': png })])),
    );
    const cell = cells.find((c) => c.type === 'code') as CodeCell;
    expect(cell.srcIndex).toBe(1);
    const [image] = cell.outputs;
    expect(image).toMatchObject({ kind: 'image', file: expect.stringMatching(/^img-[0-9a-f]{12}\.png$/), bytes: 16 });
    expect(assets.get((image as { file: string }).file)?.length).toBe(16);
  });
});

describe('markdown', () => {
  it('renders math with KaTeX', async () => {
    const { cells } = await renderNotebook(notebook(md('Kompleksiteti $O(n^2)$')));
    expect((cells[0] as MarkdownCell).html).toContain('class="katex"');
  });

  it('takes the first level-1 heading as the title, and gives sections readable, unique anchors', async () => {
    const result = await renderNotebook(
      notebook(
        md('# Laboratori 4\nHyrje e shkurtër'),
        md('## Çfarë është një graf?\nTekst'),
        md('## Çfarë është një graf?\nSërish'),
      ),
    );
    expect(result.title).toBe('Laboratori 4');
    expect(result.toc.map((t) => t.id)).toEqual(['cfare-eshte-nje-graf', 'cfare-eshte-nje-graf-2']);
  });

  it('recognizes the course’s section kinds from their headings', async () => {
    const result = await renderNotebook(
      notebook(
        md('# T'),
        md('## Detyrë Shtëpie\nx'),
        md('## Punë në Klasë\nx'),
        md('## Ushtrimi 1\nx'),
        md('## Teoria\nx'),
      ),
    );
    expect(result.sections.map((s) => s.kind)).toEqual(['homework', 'classwork', 'exercise', 'theory']);
    expect(result.hasEmbeddedHomework).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { renderNotebook } from '../../src/notebook';
import { plainText, searchSections } from '../../src/notebook/search';
import { toStored } from '../../src/notebook/stored';
import { MAX_SECTION_TEXT, MAX_SECTIONS } from '../../src/shared/search-limits';
import { fold, mark, score, snippet, terms } from '../../src/web/lib/search-text';

// A notebook's search index (#17): what a reader sees, split at the headings the lab page links to.

const notebooks = import.meta.glob<string>('./fixtures/notebooks/*.ipynb', {
  query: '?raw',
  import: 'default',
  eager: true,
});

type RawCell = { cell_type: string; source: string };
const render = async (...cells: RawCell[]) => toStored(await renderNotebook(JSON.stringify({ cells, nbformat: 4 })));
const md = (source: string): RawCell => ({ cell_type: 'markdown', source });
const code = (source: string): RawCell => ({ cell_type: 'code', source });

describe('the text a reader sees', () => {
  it('drops tags, decodes entities and keeps math as its TeX source', async () => {
    expect(
      plainText('<p>A <strong>graf</strong> &amp; <code>&lt;V, E&gt;</code></p><ul><li>një</li><li>dy</li></ul>'),
    ).toBe('A graf & <V, E> një dy');
    const nb = await render(md('Koha është $O(n \\log n)$ në çdo rast.'));
    const html = nb.cells[0]?.type === 'markdown' ? nb.cells[0].html : '';
    expect(html).toContain('katex');
    expect(plainText(html)).toBe('Koha është O(n log n) në çdo rast.');
  });
});

describe('search sections', () => {
  it('starts a section at each heading, with its anchor, text and the names its code defines', async () => {
    const nb = await render(
      md('# Laboratori 2\n\nHyrje në renditje.'),
      md('## Merge Sort\n\nPërça dhe sundo.'),
      code('def merge_sort(a):\n    return a\n\ndef _ndihmes():\n    pass\n\nclass Renditesi:\n    pass'),
      md('## Ushtrimi 1\n\nShkruani `merge`.'),
    );
    expect(searchSections(nb)).toEqual([
      { anchor: null, title: 'Laboratori 2', text: 'Hyrje në renditje.', keywords: '' },
      { anchor: 'merge-sort', title: 'Merge Sort', text: 'Përça dhe sundo.', keywords: 'merge_sort Renditesi' },
      { anchor: 'ushtrimi-1', title: 'Ushtrimi 1', text: 'Shkruani merge.', keywords: '' },
    ]);
  });

  // One test per notebook: together they take longer than a test may on a slow machine.
  it.each(Object.entries(notebooks).map(([path, raw]) => [path.split('/').pop() as string, raw]))(
    'indexes %s within the limits, at anchors the lab page has',
    async (path, raw) => {
      const nb = toStored(await renderNotebook(raw));
      const anchors = new Set(nb.cells.flatMap((cell) => (cell.type === 'markdown' && cell.id ? [cell.id] : [])));
      const sections = searchSections(nb);
      expect(sections.length, path).toBeGreaterThan(0);
      expect(sections.length, path).toBeLessThanOrEqual(MAX_SECTIONS);
      for (const s of sections) {
        if (s.anchor !== null) expect(anchors.has(s.anchor), `${path} #${s.anchor}`).toBe(true);
        expect(s.text.length).toBeLessThanOrEqual(MAX_SECTION_TEXT);
        // KaTeX's drawn copy and markup never reach the index.
        expect(s.text, path).not.toMatch(/katex|class=|aria-hidden|&(amp|lt|gt|quot|nbsp);/);
      }
    },
  );
});

describe('matching in the search palette', () => {
  it('ignores case and Albanian accents, keeping every character in place', () => {
    expect(fold('Çiftëzimi i Dijkstrës')).toBe('ciftezimi i dijkstres');
    expect(fold('Çiftëzimi').length).toBe('Çiftëzimi'.length);
    expect(terms('  Prerja   MIN ')).toEqual(['prerja', 'min']);
  });

  it('needs every term at the start of a word, and weighs the title most', () => {
    expect(score(['min'], ['Algoritmin e Dijkstrës'])).toBe(0);
    expect(score(['min'], ['prerja minimale'])).toBeGreaterThan(0);
    expect(score(['prerja', 'min'], ['Prerja', 'rrjedha'])).toBe(0);
    expect(score(['dijks'], ['Dijkstra', 'tekst'])).toBeGreaterThan(score(['dijks'], ['Hyrje', 'Dijkstra']));
  });

  it('marks the matches in the original text, accents and all', () => {
    expect(mark('Algoritmi i Dijkstrës', ['dijkstres'])).toEqual([
      { text: 'Algoritmi i ', mark: false },
      { text: 'Dijkstrës', mark: true },
    ]);
    const long = `${'fjalë '.repeat(60)}Bellman-Ford ${'tjetër '.repeat(60)}`;
    const parts = snippet(long, ['bellman']);
    expect(parts[0]?.text.startsWith('…')).toBe(true);
    expect(parts.find((p) => p.mark)?.text).toBe('Bellman');
    expect(parts.at(-1)?.text.endsWith('…')).toBe(true);
  });
});

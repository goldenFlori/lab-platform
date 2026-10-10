import { highlightPython } from './highlight.ts';
import { classifyHeading, renderMarkdownBody, slug, splitIntoSections } from './markdown.ts';
import { cleanOutputs, codeFlags, isInteractiveCell, renderOutputs } from './outputs.ts';
import type { Cell, RenderedNotebook, SectionKind, TocEntry } from './types';

// Notebook → web representation (#13), in the browser of whoever uploads it. A TypeScript port of
// the course site's site/scripts/notebook.mjs that produces the same cells (see the fixtures in
// test/notebook). It reads the .ipynb JSON and never executes anything in it; the original file
// is left as it is.

export type * from './types';

const COLLAPSE_OVER = 40;

const STDLIB = new Set([
  'os',
  'sys',
  'math',
  'random',
  'time',
  'copy',
  'collections',
  'itertools',
  'heapq',
  'threading',
  'subprocess',
  'json',
  're',
  'functools',
  'string',
  'typing',
  'dataclasses',
  'tkinter',
  'IPython',
]);

type RawCell = { cell_type?: string; source?: string | string[]; outputs?: Parameters<typeof renderOutputs>[0] };

const sourceOf = (cell: RawCell) => (Array.isArray(cell.source) ? cell.source.join('') : cell.source || '');

/** Summarizes a long implementation, so students see its shape before the detail. */
function codeSummary(code: string) {
  const defs: { t: 'class' | 'def'; n: string }[] = [];
  for (const line of code.split('\n')) {
    let m = line.match(/^\s*class\s+([A-Za-z_]\w*)/);
    if (m) {
      defs.push({ t: 'class', n: m[1] as string });
      continue;
    }
    m = line.match(/^(\s*)def\s+([A-Za-z_]\w*)/);
    if (m && (m[1] as string).length <= 4) defs.push({ t: 'def', n: m[2] as string });
  }
  const seen = new Set<string>();
  return defs
    .filter((d) => {
      const key = d.t + d.n;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 14);
}

function externalScripts(code: string) {
  const out = new Set<string>();
  for (const m of code.matchAll(/['"]([\w./-]+\.py)['"]/g)) out.add(m[1] as string);
  return [...out];
}

export async function renderNotebook(
  raw: string,
  { assets = new Map<string, Uint8Array>() }: { assets?: Map<string, Uint8Array> } = {},
): Promise<RenderedNotebook> {
  const nb = JSON.parse(raw) as { cells?: RawCell[] };
  const cells = nb.cells || [];

  const toc: TocEntry[] = [];
  const rendered: Cell[] = [];
  const imports = new Set<string>();
  const flags = {
    pygame: false,
    tkinter: false,
    widgets: false,
    plotly: false,
    matplotlib: false,
    networkx: false,
    numpy: false,
  };
  const missingScripts = new Set<string>();
  const sectionIndex: { id: string; title: string; kind: SectionKind }[] = [];
  const usedIds = new Set<string>();

  const mkId = (base: string) => {
    const root = slug(base);
    let id = root;
    let n = 2;
    while (usedIds.has(id)) id = `${root}-${n++}`;
    usedIds.add(id);
    return id;
  };

  const seenTitles = new Set<string>();
  let title: string | null = null;
  let titleSeen = false;
  let totalCodeLines = 0;

  for (const [srcIndex, cell] of cells.entries()) {
    const source = sourceOf(cell);

    if (cell.cell_type === 'markdown') {
      if (!source.trim()) continue;
      for (const sec of splitIntoSections(source)) {
        const body = sec.lines.join('\n');

        if (sec.title === null) {
          const html = renderMarkdownBody(body);
          if (html.trim()) rendered.push({ type: 'markdown', kind: 'normal', html, srcIndex });
          continue;
        }

        // The first level-1 heading is the notebook's title; the page shows it in the header.
        if (!titleSeen && sec.level === 1) {
          title = sec.title;
          titleSeen = true;
          const html = renderMarkdownBody(body);
          if (html.trim()) rendered.push({ type: 'markdown', kind: 'normal', html, srcIndex, intro: true });
          continue;
        }

        const cls = classifyHeading(sec.title);
        const id = mkId(sec.title);
        const html = renderMarkdownBody(body);

        // Some notebooks repeat a heading in a one-line cell just before its code. Keep the anchor,
        // but do not show the heading again or list it twice in the table of contents.
        const key = sec.title.trim().toLowerCase();
        const redundant = !html.trim() && seenTitles.has(key);
        seenTitles.add(key);

        if (!redundant) {
          toc.push({ id, title: sec.title, level: sec.level, kind: cls.kind });
          sectionIndex.push({ id, title: sec.title, kind: cls.kind });
        }

        rendered.push({
          type: 'markdown',
          kind: cls.kind,
          label: cls.label,
          id,
          heading: redundant ? null : sec.title,
          level: sec.level,
          redundant,
          html,
          srcIndex,
        });
      }
      continue;
    }

    if (cell.cell_type !== 'code') continue;
    if (!source.trim() && !(cell.outputs || []).length) continue;

    for (const m of source.matchAll(/^\s*(?:import|from)\s+([A-Za-z_][\w.]*)/gm)) {
      imports.add((m[1] as string).split('.')[0] as string);
    }
    const cf = codeFlags(source);
    for (const key of Object.keys(flags) as (keyof typeof flags)[]) {
      if (key !== 'numpy' && cf[key]) flags[key] = true;
    }
    if (/\bnumpy\b/.test(source)) flags.numpy = true;
    if (cf.subprocess) for (const script of externalScripts(source)) missingScripts.add(script);

    const lines = source.split('\n').length;
    totalCodeLines += lines;

    rendered.push({
      type: 'code',
      srcIndex,
      interactive: isInteractiveCell(cf),
      html: await highlightPython(source),
      raw: source,
      lines,
      collapsed: lines > COLLAPSE_OVER,
      summary: lines > COLLAPSE_OVER ? codeSummary(source) : [],
      flags: cf,
      externalScripts: cf.subprocess ? externalScripts(source) : [],
      outputs: cleanOutputs(await renderOutputs(cell.outputs, cf, assets), cf),
    });
  }

  // Long notebooks get a table of contents of levels 1-2; short ones keep level 3 too.
  const maxTocLevel = toc.length > 22 ? 2 : 3;

  return {
    title,
    toc: toc.filter((t) => t.level <= maxTocLevel),
    tocFull: toc,
    sections: sectionIndex,
    cells: rendered,
    imports: [...imports].sort(),
    dependencies: [...imports].filter((i) => !STDLIB.has(i)).sort(),
    flags,
    missingScripts: [...missingScripts],
    stats: {
      cells: cells.length,
      markdown: cells.filter((c) => c.cell_type === 'markdown').length,
      code: cells.filter((c) => c.cell_type === 'code').length,
      codeLines: totalCodeLines,
    },
    hasEmbeddedHomework: sectionIndex.some((s) => s.kind === 'homework'),
    hasClasswork: sectionIndex.some((s) => s.kind === 'classwork'),
    assets,
  };
}

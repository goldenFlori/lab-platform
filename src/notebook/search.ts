import { MAX_SECTION_KEYWORDS, MAX_SECTION_TEXT, MAX_SECTION_TITLE, MAX_SECTIONS } from '../shared/search-limits.ts';
import type { StoredNotebook } from './stored';

// A notebook's search index (#17): its sections, each with the heading it starts at, its text and
// the functions and classes its code defines. Made where the notebook is converted (the pedagog's
// browser, or the course import), so the Worker never reads a notebook to search it. Plain string
// work, no DOM, so it runs in Node too.

export type SearchSection = {
  /** The heading's anchor in the lab page, or null for the text above the first heading. */
  anchor: string | null;
  title: string;
  text: string;
  keywords: string;
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const BLOCK = new Set([
  'p',
  'div',
  'li',
  'ul',
  'ol',
  'tr',
  'td',
  'th',
  'table',
  'blockquote',
  'pre',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);
const VOID = new Set(['br', 'hr', 'img', 'input', 'wbr', 'meta', 'link', 'source', 'col']);

function decode(text: string) {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return ENTITIES[name.toLowerCase()] ?? entity;
  });
}

/**
 * The words a reader sees in converted HTML. Math keeps only its TeX source, without commands'
 * backslashes ("O(n \log n)" reads "O(n log n)"); KaTeX's drawn copy is skipped.
 */
export function plainText(html: string) {
  const out: string[] = [];
  // Per open element: inside an aria-hidden element (skip all), or inside MathML (skip all but TeX).
  const stack: { tag: string; hidden: boolean; math: boolean; tex: boolean }[] = [];
  const top = () => stack[stack.length - 1] ?? { tag: '', hidden: false, math: false, tex: false };
  const tag = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>|<!--[\s\S]*?-->/g;
  let last = 0;
  const emit = (text: string) => {
    const { hidden, math, tex } = top();
    if (hidden || (math && !tex)) return;
    out.push(
      tex
        ? ` ${decode(text)
            .replace(/\\([a-zA-Z]+)/g, ' $1 ')
            .replace(/[\\{}]/g, ' ')} `
        : decode(text),
    );
  };
  for (let match = tag.exec(html); match; match = tag.exec(html)) {
    emit(html.slice(last, match.index));
    last = tag.lastIndex;
    const [, closing, rawName, attrs = ''] = match;
    if (!rawName) continue;
    const name = rawName.toLowerCase();
    if (BLOCK.has(name)) out.push(' ');
    if (closing) {
      const at = stack.map((e) => e.tag).lastIndexOf(name);
      if (at >= 0) stack.length = at;
    } else if (!VOID.has(name) && !attrs.trimEnd().endsWith('/')) {
      const parent = top();
      stack.push({
        tag: name,
        hidden: parent.hidden || /aria-hidden="true"/.test(attrs),
        math: parent.math || name === 'math',
        tex: parent.tex || (name === 'annotation' && /application\/x-tex/.test(attrs)),
      });
    }
  }
  emit(html.slice(last));
  return out.join('').replace(/\s+/g, ' ').trim();
}

/** A function or class defined in Python code. */
const DEFINITION = /^[ \t]*(?:async[ \t]+)?(?:def|class)[ \t]+([A-Za-z_]\w*)/gm;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The notebook's sections, in order, as its search index stores them. */
export function searchSections(notebook: Pick<StoredNotebook, 'title' | 'cells'>): SearchSection[] {
  type Draft = { anchor: string | null; title: string; text: string[]; keywords: string[] };
  let current: Draft = { anchor: null, title: notebook.title ?? '', text: [], keywords: [] };
  const sections: Draft[] = [];
  sections.push(current);
  for (const cell of notebook.cells) {
    if (cell.type === 'markdown') {
      if (cell.id && cell.heading && !cell.redundant) {
        current = { anchor: cell.id, title: cell.heading, text: [], keywords: [] };
        sections.push(current);
      }
      const text = plainText(cell.html);
      if (text) current.text.push(text);
    } else {
      // The names a student would look for; helpers such as `_draw` and `__init__` are left out.
      for (const [, name] of cell.raw.matchAll(DEFINITION))
        if (name && !name.startsWith('_')) current.keywords.push(name);
    }
  }
  return sections
    .map((s) => ({
      anchor: s.anchor,
      title: clip(s.title, MAX_SECTION_TITLE),
      text: clip(s.text.join(' '), MAX_SECTION_TEXT),
      keywords: clip([...new Set(s.keywords)].join(' '), MAX_SECTION_KEYWORDS),
    }))
    .filter((s) => s.anchor !== null || s.text || s.keywords)
    .slice(0, MAX_SECTIONS);
}

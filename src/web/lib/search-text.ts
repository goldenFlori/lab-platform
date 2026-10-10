// Matching for the search palette (#17): case and accents ignored, terms at the start of words,
// matches marked in the original text. No imports, so the tests run it in Node.

/**
 * Lowercase and without accents ("Renditjë" → "renditje"), character for character, so a match's
 * position in the folded text is its position in the original.
 */
export function fold(text: string) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;
    const folded = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    out += folded.length === 1 ? folded : char;
  }
  return out;
}

export const terms = (query: string) => fold(query).split(/\s+/).filter(Boolean);

/** A piece of text to show, with the parts that match marked. */
export type Marked = { text: string; mark: boolean }[];

const WORD = /[\p{L}\p{N}]/u;

/** Where `term` starts a word in `folded` (at or after `from`), or -1: "min" finds "minimale", not "algoritmin". */
function findWord(folded: string, term: string, from = 0) {
  for (let at = folded.indexOf(term, from); at >= 0; at = folded.indexOf(term, at + 1)) {
    if (at === 0 || !WORD.test(folded[at - 1] as string)) return at;
  }
  return -1;
}

/** How well the fields match all the terms: 0 when a term is missing. Earlier fields weigh more. */
export function score(terms: string[], fields: string[]) {
  const folded = fields.map(fold);
  let total = 0;
  for (const term of terms) {
    const i = folded.findIndex((field) => findWord(field, term) >= 0);
    if (i < 0) return 0;
    total += fields.length - i;
  }
  return total;
}

/** `text` with every term marked. */
export function mark(text: string, terms: string[]): Marked {
  const folded = fold(text);
  const hits: [number, number][] = [];
  for (const term of terms) {
    for (let at = findWord(folded, term); at >= 0; at = findWord(folded, term, at + term.length)) {
      hits.push([at, at + term.length]);
    }
  }
  hits.sort((a, b) => a[0] - b[0]);
  const out: Marked = [];
  let last = 0;
  for (const [from, to] of hits) {
    if (to <= last) continue;
    const start = Math.max(from, last);
    if (start > last) out.push({ text: text.slice(last, start), mark: false });
    out.push({ text: text.slice(start, to), mark: true });
    last = to;
  }
  if (last < text.length) out.push({ text: text.slice(last), mark: false });
  return out;
}

/** About `width` characters of `text` around the first term found, marked; the start if none is. */
export function snippet(text: string, terms: string[], width = 140): Marked {
  const folded = fold(text);
  const first = Math.min(...terms.map((t) => findWord(folded, t)).filter((at) => at >= 0));
  let from = Number.isFinite(first) ? Math.max(0, first - Math.floor(width / 3)) : 0;
  // Start at a word.
  if (from > 0) from = text.indexOf(' ', from) + 1 || from;
  const to = Math.min(text.length, from + width);
  const piece = `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`;
  return mark(piece, terms);
}

import { TRANSLATE_CHARS } from '../../shared/ai-limits';
import { PART_MARK } from '../../shared/ai-sections';

// Translating a notebook with the copilot (#88), in the pedagog's browser: its text cells and the
// comments on lines of their own in its code are sent in parts, read back by their marks, reviewed,
// and put back into a copy of the .ipynb. Code, outputs and everything else stay as they are.

type Ipynb = { cells: { cell_type: string; source: string | string[] }[] } & Record<string, unknown>;

/** A piece of text to translate: a whole text cell, or one comment line in a code cell. */
export type Segment = { cell: number; line: number | null; prefix: string; text: string };

const sourceOf = (cell: Ipynb['cells'][number]) => (Array.isArray(cell.source) ? cell.source.join('') : cell.source);
const lines = (text: string) => text.split(/(?<=\n)/);

/** `# a comment` on a line of its own (not `#!`, and not a line of only # or ─ decoration). */
const COMMENT = /^(\s*#+\s?)(?!!)(.*\p{L}.*)$/u;

export function segmentsOf(notebook: Ipynb): Segment[] {
  const segments: Segment[] = [];
  notebook.cells.forEach((cell, index) => {
    const source = sourceOf(cell);
    if (cell.cell_type === 'markdown' && source.trim()) {
      segments.push({ cell: index, line: null, prefix: '', text: source });
    }
    if (cell.cell_type !== 'code') return;
    source.split('\n').forEach((text, line) => {
      const match = text.match(COMMENT);
      if (match) segments.push({ cell: index, line, prefix: match[1] ?? '# ', text: match[2] ?? '' });
    });
  });
  return segments;
}

/** The segments in requests of at most `max` characters each (one too long goes alone, and fails). */
export function batches(segments: Segment[], max = TRANSLATE_CHARS - 1000): number[][] {
  const result: number[][] = [];
  let current: number[] = [];
  let size = 0;
  segments.forEach((segment, i) => {
    if (current.length > 0 && (size + segment.text.length > max || current.length >= 80)) {
      result.push(current);
      current = [];
      size = 0;
    }
    current.push(i);
    size += segment.text.length;
  });
  if (current.length) result.push(current);
  return result;
}

/** The parts of an answer by their number (from 1); a part the model left out is missing. */
export function partsOf(answer: string): Map<number, string> {
  const marks = [...answer.matchAll(PART_MARK)];
  return new Map(
    marks.map((mark, i) => [
      Number(mark[1]),
      answer.slice((mark.index ?? 0) + mark[0].length, marks[i + 1]?.index ?? answer.length).trim(),
    ]),
  );
}

/** A copy of the notebook with each segment replaced by its translation. */
export function translated(notebook: Ipynb, segments: Segment[], texts: string[]): string {
  const cells = notebook.cells.map((cell) => ({ ...cell, source: sourceOf(cell) }));
  const byCell = new Map<number, { segment: Segment; text: string }[]>();
  segments.forEach((segment, i) => {
    const list = byCell.get(segment.cell) ?? [];
    list.push({ segment, text: texts[i] ?? segment.text });
    byCell.set(segment.cell, list);
  });
  for (const [index, list] of byCell) {
    const cell = cells[index];
    if (!cell) continue;
    if (cell.cell_type === 'markdown') {
      cell.source = list[0]?.text ?? cell.source;
      continue;
    }
    const code = cell.source.split('\n');
    for (const { segment, text } of list) {
      // A comment stays one line, whatever the translation did.
      if (segment.line !== null) code[segment.line] = segment.prefix + text.replace(/\s*\n\s*/g, ' ');
    }
    cell.source = code.join('\n');
  }
  return JSON.stringify(
    { ...notebook, cells: cells.map((cell) => ({ ...cell, source: lines(cell.source) })) },
    null,
    1,
  );
}

import type { Embed } from '../shared/notebooks';
import type { StoredNotebook } from './stored';
import type { CodeCell, MarkdownCell } from './types';

// Presentation mode (#15): a notebook as the steps a pedagog walks through in class. `at` is the
// cell's position in the notebook, which a solution notebook made from it shares.

export type Slide =
  | { kind: 'text'; at: number; cell: MarkdownCell }
  | { kind: 'code'; at: number; cell: CodeCell }
  | { kind: 'viz'; at: number; embed: Embed };

export function slidesOf(notebook: StoredNotebook, embeds: Embed[]): Slide[] {
  const embedAt = new Map(embeds.map((embed) => [embed.cell, embed]));
  const lastOfSource = new Map<number, number>();
  notebook.cells.forEach((cell, i) => {
    lastOfSource.set(cell.srcIndex, i);
  });

  const slides: Slide[] = [];
  notebook.cells.forEach((cell, at) => {
    const embed = embedAt.get(cell.srcIndex);
    // Code that opens a desktop window is not shown in class: its visualization takes its place.
    if (cell.type === 'code' && cell.interactive && embed) {
      slides.push({ kind: 'viz', at, embed });
      return;
    }
    if (cell.type === 'code') slides.push({ kind: 'code', at, cell });
    // A cell that is only an anchor has nothing to show.
    else if (cell.html.trim() || cell.heading) slides.push({ kind: 'text', at, cell });
    if (embed && lastOfSource.get(cell.srcIndex) === at) slides.push({ kind: 'viz', at, embed });
  });
  return slides;
}

/**
 * Whether `solution` is the solved version of `notebook`: the same cells in the same order, with the
 * same text, so each code cell can be swapped for its solved code and real outputs.
 */
export function isSolutionOf(solution: StoredNotebook, notebook: StoredNotebook): boolean {
  return (
    solution.cells.length === notebook.cells.length &&
    notebook.cells.every((cell, i) => {
      const other = solution.cells[i];
      if (!other || other.type !== cell.type || other.srcIndex !== cell.srcIndex) return false;
      if (cell.type === 'code') return true;
      return other.type === 'markdown' && other.html === cell.html && other.heading === cell.heading;
    })
  );
}

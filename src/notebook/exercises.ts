import type { Exercise } from '../shared/exercises';
import type { StoredNotebook } from './stored';

// Exercises a notebook already checks itself (#51): the course notebooks end each exercise with a
// cell that calls `kontrollo("Ushtrimi 2 — …", _testet)`. Found where the notebook is converted;
// staff can change the list in the app.

const CHECK_CALL = /^kontrollo\(\s*(["'])(.+?)\1\s*,/m;

export function detectExercises(notebook: Pick<StoredNotebook, 'cells'>): Exercise[] {
  const found = new Map<number, Exercise>();
  for (const cell of notebook.cells) {
    if (cell.type !== 'code' || cell.interactive || found.has(cell.srcIndex)) continue;
    const title = CHECK_CALL.exec(cell.raw)?.[2]?.trim();
    if (title) found.set(cell.srcIndex, { cell: cell.srcIndex, title: title.slice(0, 160), test: null });
  }
  return [...found.values()];
}

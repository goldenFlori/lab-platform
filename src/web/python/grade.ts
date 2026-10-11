import type { StoredNotebook } from '../../notebook/stored';
import type { CheckStatus, Exercise } from '../../shared/exercises';
import type { ExerciseGrading, GradeResult } from '../../shared/grading';
import { cellFile } from './runner';
import { PythonSession } from './session';

// Grading a submission on the pedagog's machine (#53). Each submission runs in a fresh Python, so
// one student's code never reaches another's. The notebook's cells run in order with the student's
// code; an exercise's check comes from the notebook and the server, never from the student:
// a cell that only checks (kontrollo) runs as the notebook has it, a visible test and a hidden test
// as staff wrote them. An exercise passes when its check and its hidden test both pass.

/** A cell may run this long while grading; a student's endless loop must not stop the batch. */
const GRADING_LIMIT_MS = 30_000;

/** A check cell that is also left for the student to fill in: their version is their answer. */
const LEFT_TO_FILL = /raise NotImplementedError|\b___\b|PLOTESO/;

export type GradeOutcome = { autoScore: number; maxScore: number; results: GradeResult[] };

export async function gradeSubmission(
  notebook: StoredNotebook,
  code: { cell: number; code: string }[],
  exercises: Exercise[],
  grading: ExerciseGrading[],
): Promise<GradeOutcome> {
  const own = new Map(code.map((c) => [c.cell, c.code]));
  const byCell = new Map(exercises.map((e) => [e.cell, e]));
  const setup = new Map(grading.map((g) => [g.cell, g]));
  const statuses = new Map<number, CheckStatus>();
  const session = new PythonSession({ input: false, runLimitMs: GRADING_LIMIT_MS });
  try {
    let n = 0;
    for (const cell of notebook.cells) {
      if (cell.type !== 'code') continue;
      n++;
      if (cell.interactive) continue;
      const exercise = byCell.get(cell.srcIndex);
      const checksOnly = exercise && exercise.test === null && !LEFT_TO_FILL.test(cell.raw);
      const source = checksOnly ? cell.raw : (own.get(cell.srcIndex) ?? cell.raw);
      const run = await session.run(
        `cell-${n}`,
        source,
        cellFile(n - 1),
        exercise ? { test: exercise.test } : undefined,
      );
      if (!exercise || statuses.has(cell.srcIndex)) continue;
      let status: CheckStatus = run.outcome?.kind === 'ok' ? (run.outcome.check?.status ?? 'error') : 'error';
      const hidden = setup.get(cell.srcIndex)?.hiddenTest;
      if (status === 'pass' && hidden) {
        const check = await session.run(`hidden-${n}`, '', `<cell ${n} hidden>`, { test: hidden });
        status = check.outcome?.kind === 'ok' ? (check.outcome.check?.status ?? 'error') : 'error';
      }
      statuses.set(cell.srcIndex, status);
    }
  } finally {
    session.dispose();
  }
  const points = (cell: number) => setup.get(cell)?.points ?? 1;
  const results = exercises.map((e) => ({ cell: e.cell, status: statuses.get(e.cell) ?? ('error' as const) }));
  return {
    autoScore: results.filter((r) => r.status === 'pass').reduce((sum, r) => sum + points(r.cell), 0),
    maxScore: exercises.reduce((sum, e) => sum + points(e.cell), 0),
    results,
  };
}

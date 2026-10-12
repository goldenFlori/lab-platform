import { z } from 'zod';
import { AI_MODES, type AiMode, MAX_EXERCISES, MAX_TEST } from './exercise-limits';

// A notebook's exercises (#51): which cells check a student's work, and how. The app imports only
// types from this file; its limits are in exercise-limits.ts.

export { AI_MODES, MAX_EXERCISES, MAX_TEST };

/**
 * One exercise: running `cell` checks it. With no `test`, the cell itself calls
 * `kontrollo(title, tests)`, as the course notebooks do; otherwise `test` (Python, usually asserts)
 * runs right after the cell, in the same namespace. `ai`: what "Explain my error" may say on it
 * (#86); the server always sends it, and leaving it out when saving means hints.
 */
export type Exercise = { cell: number; title: string; test: string | null; ai?: AiMode };

export const exercisesInput = z.object({
  exercises: z
    .array(
      z.object({
        cell: z.number().int().min(0).max(10_000),
        title: z.string().trim().min(1).max(160),
        test: z.string().max(MAX_TEST).nullable(),
        ai: z.enum(AI_MODES).optional(),
      }),
    )
    .max(MAX_EXERCISES)
    .refine((list) => new Set(list.map((e) => e.cell)).size === list.length, 'One exercise per cell'),
});

/** What a check found: all tests passed, one failed (with its message), not written yet, or a crash. */
export type CheckStatus = 'pass' | 'fail' | 'todo' | 'error';

/**
 * Progress on a notebook's exercises: the cells this user has completed and, for staff who may see
 * the course's activity, how many of their students completed each (counts only, never who).
 */
export type ExerciseProgress = {
  done: number[];
  counts: { cell: number; students: number }[] | null;
  /** Students in the groups counted. */
  students: number | null;
};

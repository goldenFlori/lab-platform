import { z } from 'zod';
import { traceRows } from './trace-answers';

// A student's own version of a code cell (#49). The app imports only types from this file.

/** Characters of code kept per cell: far more than any lab cell. */
export const MAX_CODE = 100_000;

export const codeEditInput = z.object({ code: z.string().max(MAX_CODE) });

export type CodeEdit = { cell: number; code: string; updatedAt: string };

/**
 * A student's work since their last save (#177), saved in one request: changed code cells (null puts
 * the original back) and graded trace tables' rows. At most this many cells, so it stays one small
 * batch; the app sends more in several.
 */
export const MAX_WORK_CELLS = 20;

export const workInput = z
  .object({
    code: z
      .array(z.object({ cell: z.number().int().min(0).max(10_000), code: z.string().max(MAX_CODE).nullable() }))
      .max(MAX_WORK_CELLS),
    traces: z.array(z.object({ cell: z.number().int().min(0).max(10_000), rows: traceRows })).max(MAX_WORK_CELLS),
  })
  .refine((w) => w.code.length + w.traces.length <= MAX_WORK_CELLS, 'Too many cells at once')
  .refine((w) => new Set(w.code.map((c) => c.cell)).size === w.code.length, 'One entry per code cell')
  .refine((w) => new Set(w.traces.map((t) => t.cell)).size === w.traces.length, 'One entry per table');

/** What a save answers: when, and the tables it could not keep because their notebook closed. */
export type WorkSaved = { savedAt: string; refused: number[] };

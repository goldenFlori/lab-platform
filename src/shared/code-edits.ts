import { z } from 'zod';
import { MAX_CODE, MAX_WORK_CELLS } from './code-limits';
import { traceRows } from './trace-answers';

export { MAX_CODE, MAX_WORK_CELLS };

// A student's own version of a code cell (#49). The app imports only types from this file.

export const codeEditInput = z.object({ code: z.string().max(MAX_CODE) });

export type CodeEdit = { cell: number; code: string; updatedAt: string };

/**
 * A student's work since their last save (#177), saved in one request: changed code cells (null puts
 * the original back) and graded trace tables' rows, at most MAX_WORK_CELLS; the app sends more in
 * several.
 */
export const workInput = z
  .object({
    code: z
      .array(z.object({ cell: z.number().int().min(0).max(10_000), code: z.string().max(MAX_CODE).nullable() }))
      .max(MAX_WORK_CELLS),
    traces: z.array(z.object({ cell: z.number().int().min(0).max(10_000), rows: traceRows })).max(MAX_WORK_CELLS),
    /** The notebook's version on the student's page (#208), so a save from an older one finds its cells. */
    version: z.string().max(64).optional(),
  })
  .refine((w) => w.code.length + w.traces.length <= MAX_WORK_CELLS, 'Too many cells at once')
  .refine((w) => new Set(w.code.map((c) => c.cell)).size === w.code.length, 'One entry per code cell')
  .refine((w) => new Set(w.traces.map((t) => t.cell)).size === w.traces.length, 'One entry per table');

/**
 * What a save answers: when, the tables it could not keep because their notebook closed, and the
 * notebook's version now (#208): when it is not the page's, the page loads the new one.
 */
export type WorkSaved = { savedAt: string; refused: number[]; version: string };

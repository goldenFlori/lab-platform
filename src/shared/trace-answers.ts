import { z } from 'zod';

// A student's rows of a graded trace table (#168), saved as they type while its notebook is open for
// submission. The app imports only types from this file.

/** Floyd-Warshall's largest table: 6 × 6 cells in a row, 6 rows. Other tables are far smaller. */
export const traceAnswersInput = z.object({
  rows: z
    .array(z.record(z.string().max(16), z.string().max(24)))
    .max(40)
    .refine((rows) => rows.every((row) => Object.keys(row).length <= 40), 'Too many cells in a row'),
});

/**
 * What the lab page needs about a graded trace table: the user's saved rows, whether they may still
 * change them (its notebook is open to them for submission), and whether they are staff (who
 * practise on it instead).
 */
export type TraceAnswers = { rows: Record<string, string>[]; open: boolean; staff: boolean; points: number };

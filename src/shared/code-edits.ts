import { z } from 'zod';

// A student's own version of a code cell (#49). The app imports only types from this file.

/** Characters of code kept per cell: far more than any lab cell. */
export const MAX_CODE = 100_000;

export const codeEditInput = z.object({ code: z.string().max(MAX_CODE) });

export type CodeEdit = { cell: number; code: string; updatedAt: string };

// Limits of a student's saved code (#49, #177), apart from the schemas in code-edits.ts: the app
// imports values from here, and from there only types (#193).

/** Characters of code kept per cell: far more than any lab cell. */
export const MAX_CODE = 100_000;

/** Cells saved in one request; the app sends more in several. */
export const MAX_WORK_CELLS = 20;

// Limits on a notebook's exercises (#51), apart from their shapes so the app can use them without Zod.

/** Longest visible test staff may write for one exercise. */
export const MAX_TEST = 20_000;
export const MAX_EXERCISES = 100;

/**
 * What "Explain my error" may say on an exercise (#86): nothing, hints only (the default), or the
 * full fix, which students get only once the lab's solutions are open to them.
 */
export const AI_MODES = ['off', 'hints', 'full'] as const;
export type AiMode = (typeof AI_MODES)[number];

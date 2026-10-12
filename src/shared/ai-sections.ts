// The headings the copilot writes under, in this order: the server's prompts ask for them and the
// browser reads them. Plain headings, not JSON: code inside JSON strings breaks easily. Apart from
// ai.ts, so the app needs no Zod.

/** An exercise variant (#85). */
export const VARIANT_SECTIONS = ['TITLE', 'TASK', 'STARTER', 'SOLUTION', 'TESTS'] as const;

/**
 * A part of a translation (#88): `[[n]]` on a line of its own, numbered from 1. Not a Markdown
 * heading, which the notebooks' own text is full of.
 */
export const partMark = (n: number) => `[[${n}]]`;
export const PART_MARK = /^\[\[(\d+)\]\]\s*$/gm;

/** One quiz question (#87); a draft has several, each starting with QUESTION. */
export const QUIZ_SECTIONS = ['QUESTION', 'A', 'B', 'C', 'D', 'ANSWER'] as const;

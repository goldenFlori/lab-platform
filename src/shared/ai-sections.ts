// The headings the copilot writes under, in this order: the server's prompts ask for them and the
// browser reads them. Plain headings, not JSON: code inside JSON strings breaks easily. Apart from
// ai.ts, so the app needs no Zod.

/** An exercise variant (#85). */
export const VARIANT_SECTIONS = ['TITLE', 'TASK', 'STARTER', 'SOLUTION', 'TESTS'] as const;

/** One quiz question (#87); a draft has several, each starting with QUESTION. */
export const QUIZ_SECTIONS = ['QUESTION', 'A', 'B', 'C', 'D', 'ANSWER'] as const;

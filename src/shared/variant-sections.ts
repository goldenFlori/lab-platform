// The headings the copilot writes an exercise variant under (#85), in this order: the server's
// prompt asks for them and the browser reads them. Apart from ai.ts, so the app needs no Zod.

export const VARIANT_SECTIONS = ['TITLE', 'TASK', 'STARTER', 'SOLUTION', 'TESTS'] as const;

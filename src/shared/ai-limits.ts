// Limits of AI requests that the app needs too, apart from ai.ts so it needs no Zod.

/** Most text one translation request carries (#88); the browser sends a notebook in several. */
export const TRANSLATE_CHARS = 8000;

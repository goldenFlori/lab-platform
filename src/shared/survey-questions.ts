// The end-of-semester survey's questions (#102): fixed, so semesters and courses compare. Apart from
// surveys.ts, so the app needs no Zod.

export const SURVEY_QUESTIONS = ['code', 'visualizations', 'live', 'ai'] as const;
export type SurveyQuestion = (typeof SURVEY_QUESTIONS)[number];

/** Staff see results only from this many answers, so no one can be singled out. */
export const SURVEY_MIN_ANSWERS = 5;

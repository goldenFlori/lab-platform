import { z } from 'zod';
import { SURVEY_QUESTIONS, type SurveyQuestion } from './survey-questions';

// The end-of-semester survey (#102): anonymous ratings from 1 to 5 and a comment, the satisfaction
// evidence the grant asks for. The app imports only types from this file.

export const surveyInput = z.object({ closesAt: z.iso.datetime() });

const rating = z.number().int().min(1).max(5);

/** A student's answer: a rating for each question they could judge (left out: "did not use it"). */
export const surveyAnswerInput = z.object({
  ratings: z.object(
    Object.fromEntries(SURVEY_QUESTIONS.map((q) => [q, rating.optional()])) as Record<
      SurveyQuestion,
      z.ZodOptional<typeof rating>
    >,
  ),
  comment: z.string().trim().max(1000).optional(),
});

export type SurveyAnswerInput = z.infer<typeof surveyAnswerInput>;

/** The survey as one user sees it. */
export type SurveyView = {
  survey: { closesAt: string; open: boolean } | null;
  /** A student of the course who has not answered this survey, while it is open. */
  canAnswer: boolean;
  answered: boolean;
  /** For staff who may see the course's analytics. */
  results: SurveyResults | null;
};

export type SurveyResults = {
  respondents: number;
  students: number;
  /** False below SURVEY_MIN_ANSWERS: then no averages and no comments. */
  enough: boolean;
  questions: { question: SurveyQuestion; answers: number; average: number | null }[];
  comments: string[];
};

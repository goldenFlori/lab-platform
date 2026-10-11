import { z } from 'zod';
import { MAX_TEST } from './exercise-limits';
import type { CheckStatus } from './exercises';

// Grading on the pedagog's machine (#53): points and hidden tests per exercise (staff only), the
// grades a batch re-run produces, the pedagog's adjustments, and their release. The app imports
// only types from this file.

/** How one exercise is graded. */
export type ExerciseGrading = { cell: number; points: number; hiddenTest: string | null };

export const gradingInput = z.object({
  exercises: z
    .array(
      z.object({
        cell: z.number().int().min(0).max(10_000),
        points: z.number().int().min(0).max(1000),
        hiddenTest: z.string().max(MAX_TEST).nullable(),
      }),
    )
    .max(100),
});

const status = z.enum(['pass', 'fail', 'todo', 'error']);

/** A batch run's result for one student, sent by the pedagog's browser. */
export const gradeRunInput = z.object({
  autoScore: z.number().int().min(0).max(100_000),
  maxScore: z.number().int().min(0).max(100_000),
  results: z.array(z.object({ cell: z.number().int().min(0).max(10_000), status })).max(100),
});

/** The pedagog's adjustment: a score in place of the run's (null for the run's), and feedback. */
export const gradeReviewInput = z.object({
  score: z.number().int().min(0).max(100_000).nullable(),
  feedback: z.string().trim().max(4000).nullable(),
});

export type GradeResult = { cell: number; status: CheckStatus };

/** A grade as staff see it. */
export type StaffGrade = {
  userId: string;
  autoScore: number;
  maxScore: number;
  results: GradeResult[];
  score: number | null;
  feedback: string | null;
  gradedAt: string;
  releasedAt: string | null;
};

/** A released grade as its student sees it. */
export type MyGrade = { score: number; maxScore: number; feedback: string | null };

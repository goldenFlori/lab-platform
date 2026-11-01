import { z } from 'zod';
import { MAX_TEST } from './exercise-limits';
import type { CheckStatus } from './exercises';
import type { TraceScore } from './trace-grading';

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

/** A comment beside a cell of the student's code (#220). */
export type CellComment = { cell: number; text: string };

/**
 * The pedagog's adjustment: a score in place of the run's (null for the run's), feedback, and comments
 * by cell (#220). Each part is changed only when sent.
 */
export const gradeReviewInput = z.object({
  score: z.number().int().min(0).max(100_000).nullable().optional(),
  feedback: z.string().trim().max(4000).nullable().optional(),
  comments: z
    .array(z.object({ cell: z.number().int().min(0).max(10_000), text: z.string().trim().min(1).max(2000) }))
    .max(100)
    .refine((list) => new Set(list.map((c) => c.cell)).size === list.length, 'One comment per cell')
    .optional(),
});

export type GradeResult = { cell: number; status: CheckStatus };

/** A grade as staff see it. */
export type StaffGrade = {
  userId: string;
  autoScore: number;
  maxScore: number;
  results: GradeResult[];
  /** Each graded trace table's rows right, scored by the server and included in autoScore (#168). */
  traces: TraceScore[];
  score: number | null;
  feedback: string | null;
  comments: CellComment[];
  gradedAt: string;
  releasedAt: string | null;
};

/** A released grade as its student sees it. */
export type MyGrade = { score: number; maxScore: number; feedback: string | null; comments: CellComment[] };

/**
 * A course's released grades (#114) for the groups the user grades, so the pedagog can take them to
 * the institution's records. Only notebooks with a released grade among these students.
 */
export type CourseGrades = {
  notebooks: { id: string; lab: number; title: string }[];
  students: { id: string; username: string; fullName: string; group: string }[];
  grades: { userId: string; notebookId: string; score: number; maxScore: number }[];
};

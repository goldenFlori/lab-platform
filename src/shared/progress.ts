import type { MyGrade } from './grading';

// A student's own progress in a course (#99): per lab, whether they opened it, and per notebook the
// exercises solved, the submission and the released grade. Only ever the user's own.

export type NotebookProgress = {
  id: string;
  title: string;
  exercises: number;
  solved: number;
  /** The latest deadline among the user's groups; null when it is not open for submission. */
  dueAt: string | null;
  submittedAt: string | null;
  grade: MyGrade | null;
};

export type LabProgress = { id: string; n: number; title: string; opened: boolean; notebooks: NotebookProgress[] };

export type MyProgress = { labs: LabProgress[] };

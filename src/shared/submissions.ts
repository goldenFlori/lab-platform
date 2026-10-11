import { z } from 'zod';

// Handing in work (#52): a notebook opened for submission per group, until a deadline, and what
// students hand in. The app imports only types from this file.

/** Characters of changed code one submission may hold. */
export const MAX_SUBMISSION_CODE = 1_000_000;

export const assignmentInput = z.object({ dueAt: z.iso.datetime({ offset: true }) });

/** A group's deadline for a notebook. */
export type Assignment = { groupId: string; dueAt: string };

export type SubmissionSummary = {
  submittedAt: string;
  /** Times handed in, the last one counting. */
  attempts: number;
  /** The exercises (cells) solved then. */
  solved: number[];
};

/** What a student sees: their deadline, if the notebook is open to them, and what they handed in. */
export type MySubmission = {
  dueAt: string | null;
  /** Before the deadline: handing in (again) is possible. */
  open: boolean;
  submission: SubmissionSummary | null;
};

/** Staff who review a group: its students and what each handed in. */
export type SubmissionList = {
  /** The groups this user reviews, with their deadline for the notebook. */
  groups: { id: string; name: string; dueAt: string | null }[];
  group: string | null;
  students: { id: string; fullName: string; username: string; submission: SubmissionSummary | null }[];
};

export type SubmissionDetail = SubmissionSummary & {
  fullName: string;
  username: string;
  /** The student's code for the cells they changed, by cell (srcIndex). */
  code: { cell: number; code: string }[];
};

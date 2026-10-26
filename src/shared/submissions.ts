import { z } from 'zod';

// Handing in work (#52): a notebook opened for submission per group, until a deadline, and what
// students hand in. The app imports only types from this file.

/** Characters of changed code one submission may hold. */
export const MAX_SUBMISSION_CODE = 1_000_000;

/** A kolokium's length, in minutes, from each student's start (#169). */
export const KOLOKIUM_MINUTES = { min: 5, max: 300 } as const;

export const assignmentInput = z
  .object({
    dueAt: z.iso.datetime({ offset: true }),
    /** A kolokium (#169): students start between opensAt and dueAt, then have `minutes`, once. */
    kolokium: z
      .object({
        opensAt: z.iso.datetime({ offset: true }),
        minutes: z.number().int().min(KOLOKIUM_MINUTES.min).max(KOLOKIUM_MINUTES.max),
      })
      .nullable()
      .optional(),
  })
  .refine((a) => !a.kolokium || Date.parse(a.kolokium.opensAt) < Date.parse(a.dueAt), 'Opens after it closes');

export type KolokiumSetup = { opensAt: string; minutes: number };

/** A group's deadline for a notebook, and its kolokium settings when it is one. */
export type Assignment = { groupId: string; dueAt: string; kolokium: KolokiumSetup | null };

/**
 * A kolokium as its student sees it (#169), also before they start, when its notebook is still closed
 * to them. `endsAt`: the earlier of their start plus its minutes, and its due time.
 */
export type Kolokium = {
  notebookId: string;
  title: string;
  opensAt: string;
  dueAt: string;
  minutes: number;
  startedAt: string | null;
  endsAt: string | null;
  submittedAt: string | null;
};

/** When a student's kolokium ends: their start plus its minutes, or its due time if earlier. */
export const kolokiumEnd = (startedAt: number, minutes: number, dueAt: number) =>
  Math.min(startedAt + minutes * 60_000, dueAt);

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
  /** Their grade, once released (#53). */
  grade: import('./grading').MyGrade | null;
  /** Before the deadline: handing in (again) is possible. A kolokium: once, while its time runs. */
  open: boolean;
  submission: SubmissionSummary | null;
  /** When the notebook is a kolokium for the user (#169). */
  kolokium: Kolokium | null;
};

/** Staff who review a group: its students and what each handed in. */
export type SubmissionList = {
  /** The groups this user reviews, with their deadline for the notebook. */
  groups: { id: string; name: string; dueAt: string | null; kolokium: KolokiumSetup | null }[];
  group: string | null;
  students: {
    id: string;
    fullName: string;
    username: string;
    submission: SubmissionSummary | null;
    /** A kolokium (#169): when they started, if they have. */
    startedAt: string | null;
  }[];
};

export type SubmissionDetail = SubmissionSummary & {
  fullName: string;
  username: string;
  /** The student's code for the cells they changed, by cell (srcIndex). */
  code: { cell: number; code: string }[];
};

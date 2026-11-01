import { z } from 'zod';

// Privacy (#100): everything stored about a user, as one download, and their request to delete it.
// The app imports only types from this file.

type When = string;

/** What one organization holds about the user. Names of courses, labs and notebooks, not ids. */
export type OrganizationData = {
  organization: { name: string; slug: string };
  memberships: { role: string; course: string | null; group: string | null; since: When }[];
  labsOpened: { lab: string; kind: string; day: string }[];
  codeEdits: { notebook: string; cell: number; code: string; savedAt: When }[];
  /** Rows of graded trace tables, as saved while their notebook was open (#168). */
  traceAnswers: { notebook: string; cell: number; rows: Record<string, string>[]; savedAt: When }[];
  /** Kolokia started, and when (#169). */
  kolokiumStarts: { notebook: string; startedAt: When }[];
  exercisesSolved: { notebook: string; cell: number; at: When }[];
  /** First answers to the decisions of visualizations and trace tables (#151). */
  firstTries: {
    notebook: string;
    cell: number;
    topic: string;
    prompt: string;
    pick: string;
    correct: boolean;
    day: string;
  }[];
  /** Hints written by staff that the user revealed (#215). */
  hintsRevealed: { notebook: string; cell: number; hint: number; day: string }[];
  submissions: {
    notebook: string;
    code: { cell: number; code: string }[];
    solved: number[];
    attempts: number;
    at: When;
  }[];
  /** Only released grades: drafts are the staff's until they release them. */
  grades: {
    notebook: string;
    score: number;
    maxScore: number;
    feedback: string | null;
    /** The pedagog's comments beside cells of their code (#220). */
    comments: { cell: number; text: string }[] | null;
    releasedAt: When;
  }[];
  aiQuestions: { notebook: string; cell: number; code: string; error: string; answer: string; at: When }[];
  aiUse: { course: string; day: string; requests: number }[];
  deletionRequests: { note: string | null; at: When; handledAt: When | null }[];
};

export type MyData = {
  exportedAt: When;
  account: { username: string; fullName: string; email: string | null; locale: string | null; since: When };
  organizations: OrganizationData[];
};

export const deletionRequestInput = z.object({ note: z.string().trim().max(500).optional() });

/** A deletion request, as the institution's admin sees it. */
export type DeletionRequestView = {
  id: string;
  name: string;
  username: string;
  note: string | null;
  createdAt: When;
  handledAt: When | null;
};

/** A released grade of the person, for the institution's records before it erases them (#115). */
export type PersonGrade = {
  course: string;
  lab: number;
  notebook: string;
  score: number;
  maxScore: number;
  releasedAt: When;
};

/** An erasure the institution carried out (#115): nothing about the person, only when and by whom. */
export type ErasureView = {
  id: string;
  requestedAt: When;
  erasedAt: When;
  /** Null once the admin who did it is gone. */
  by: string | null;
  accountDeleted: boolean;
};

export type EraseResult = { accountDeleted: boolean };

import { z } from 'zod';
import type { PredictionTopic } from './predictions';

// Learning activity (#18): what students do in a course, kept as at most one row per student, lab,
// kind and day, and shown to staff only as totals. The app imports only types from this file.

/**
 * Opened a lab's notebook; downloaded its .ipynb (to work on it); used one of its visualizations;
 * completed one of its exercises (#51); ran its code (#101); joined its Live Lab (#101).
 */
export const ACTIVITY_KINDS = ['view', 'download', 'visualization', 'exercise', 'run', 'live'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Days and weeks (Monday to Sunday) are counted in the institution's time. One zone for now. */
export const ACTIVITY_TIME_ZONE = 'Europe/Tirane';

/** Weeks a report covers at most. */
export const REPORT_WEEKS = 26;

/** Sent by the app; the others are recorded by the API as the files are served. */
export const activityInput = z.object({ kind: z.enum(['visualization', 'run']) });

type Counts = Record<ActivityKind, number>;

/** A course's activity for staff with analytics.view: counts of students, never who they are. */
export type ActivityReport = {
  /** The groups this user may see the activity of; `group` is the one shown, or null for all of them. */
  groups: { id: string; name: string }[];
  group: string | null;
  /** Students in the groups shown. */
  students: number;
  /** From the oldest week shown to this week: students active at all, and per kind. */
  weeks: ({ week: string; active: number } & Counts)[];
  /** Per lab, since the start: how many of the students did each. */
  labs: ({ id: string; n: number; title: string } & Counts)[];
};

/** Days a pilot report covers at most: a semester and its exams. */
export const PILOT_MAX_DAYS = 200;

/** One number of the pilot report: how many students did it, and how often (student-days or items). */
export type PilotCount = { students: number; total: number };

/**
 * The pilot report (#101) for the grant application: counts of the students of the groups shown,
 * over a period. Never a name.
 */
export type PilotReport = {
  course: { title: string; academicYear: string };
  groups: { id: string; name: string }[];
  group: string | null;
  from: string;
  to: string;
  students: number;
  /** Students active at all, per week (Monday) of the period. */
  weeks: { week: string; active: number }[];
  /** Students active at least once in the period. */
  active: number;
  labsOpened: PilotCount;
  codeRuns: PilotCount;
  liveLabs: PilotCount;
  visualizations: PilotCount;
  exercisesCompleted: PilotCount;
  submissions: PilotCount;
  aiQuestions: PilotCount;
  aiRequests: number;
  /** Learning (#153): first-try results of predictions and trace tables in the period. */
  understanding: PilotUnderstanding;
};

/** Answers counted at the first try, and how many of them were right. */
export type FirstTries = { answers: number; right: number };

export type PilotUnderstanding = FirstTries & {
  students: number;
  /** Per topic, each from five students up. */
  topics: (FirstTries & { topic: PredictionTopic; students: number })[];
  /** Per week (Monday) of the period. */
  weeks: (FirstTries & { week: string })[];
  /**
   * Students who answered on two days or more: their first day against their later days. Null below
   * five such students.
   */
  growth: { students: number; firstDay: FirstTries; later: FirstTries } | null;
  /** Trace-table rows checked, and by how many students. */
  traceRows: PilotCount;
};

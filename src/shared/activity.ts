import { z } from 'zod';

// Learning activity (#18): what students do in a course, kept as at most one row per student, lab,
// kind and day, and shown to staff only as totals. The app imports only types from this file.

/** Opened a lab's notebook; downloaded its .ipynb (to work on it); used one of its visualizations. */
export const ACTIVITY_KINDS = ['view', 'download', 'visualization'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Days and weeks (Monday to Sunday) are counted in the institution's time. One zone for now. */
export const ACTIVITY_TIME_ZONE = 'Europe/Tirane';

/** Weeks a report covers at most. */
export const REPORT_WEEKS = 26;

/** Sent by the app; the others are recorded by the API as the files are served. */
export const activityInput = z.object({ kind: z.literal('visualization') });

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

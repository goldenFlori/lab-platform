// A student's mark in a lab hour's register (#222). No imports: the app uses it without Zod.

export const ATTENDANCE_STATUSES = ['present', 'absent', 'excused'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** A group's registers, as staff of the group see them. */
export type GroupAttendance = {
  sessions: { id: string; day: string; label: string }[];
  marks: { sessionId: string; userId: string; status: AttendanceStatus }[];
};

/** A student's own attendance in a course. */
export type MyAttendance = { day: string; label: string; status: AttendanceStatus }[];

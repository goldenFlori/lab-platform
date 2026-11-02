import { z } from 'zod';
import { ATTENDANCE_STATUSES } from './attendance-status';

// Attendance for a lab hour (#222): request shapes. The app imports only types from this file.

export * from './attendance-status';

export const attendanceSessionInput = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** The lab of the hour: its title names the register, and who opened it that day are marked present. */
  labId: z.string().max(64),
});

export const attendanceMarkInput = z.object({ status: z.enum(ATTENDANCE_STATUSES) });

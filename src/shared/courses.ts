import { z } from 'zod';

// Request and response shapes for courses, groups and joining (#10).

const title = z.string().trim().min(1).max(120);
/** For example "2026/27". */
const academicYear = z
  .string()
  .trim()
  .regex(/^\d{4}\/\d{2}$/);

export const createCourseInput = z.object({
  title,
  academicYear,
  /** Last year's course: its labs and template are copied, not its groups or visibility. */
  copyFromCourseId: z.string().optional(),
});

export const updateCourseInput = z.object({ title: title.optional(), academicYear: academicYear.optional() });

export const groupInput = z.object({ name: z.string().trim().min(1).max(60) });

export const joinCodeSwitchInput = z.object({
  /** true: a new code (replacing any old one); false: joining is switched off. */
  enabled: z.boolean(),
});

export const joinInput = z.object({ code: z.string().max(32) });

export type CourseSummary = {
  id: string;
  title: string;
  academicYear: string;
  /** ISO time, or null while the course is current. */
  archivedAt: string | null;
};

export type GroupView = {
  id: string;
  name: string;
  /** Only for those who may manage the group's students; otherwise left out. Null: joining is off. */
  joinCode?: string | null;
  permissions: { manageStudents: boolean };
};

export type CourseDetail = {
  course: CourseSummary;
  groups: GroupView[];
  permissions: { manage: boolean };
};

export type JoinResult = {
  organization: { slug: string; name: string };
  course: { id: string; title: string };
  group: { id: string; name: string };
};

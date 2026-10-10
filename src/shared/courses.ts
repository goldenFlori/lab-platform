import { z } from 'zod';
import { LOCALES, type Locale } from './locale';

// Request and response shapes for courses, groups and joining (#10).

const title = z.string().trim().min(1).max(120);
/** For example "2026/27". */
const academicYear = z
  .string()
  .trim()
  .regex(/^\d{4}\/\d{2}$/);

/** The course's interface language for those who have not chosen one (#19); null is the default. */
const locale = z.enum(LOCALES).nullable();

export const createCourseInput = z.object({
  title,
  academicYear,
  locale: locale.optional(),
  /** Last year's course: its labs and template are copied, not its groups or visibility. */
  copyFromCourseId: z.string().optional(),
});

export const updateCourseInput = z.object({
  title: title.optional(),
  academicYear: academicYear.optional(),
  locale: locale.optional(),
});

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
  locale: Locale | null;
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
  /** analytics: may see the course's activity, for the whole course or some of its groups (#18). */
  permissions: { manage: boolean; analytics: boolean };
};

export type JoinResult = {
  organization: { slug: string; name: string };
  course: { id: string; title: string };
  group: { id: string; name: string };
};

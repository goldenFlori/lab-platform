import { z } from 'zod';
import { academicYear, courseTitle } from './courses';

// Sharing a course with other institutions (#203). Its author shares a link; staff who may create
// courses in another institution open it and copy the course into a new one of their own: labs,
// notebooks, visualizations and exercises, and its solutions only when the author includes them.
// Never students, groups, their work or grades. The copy is independent, and both sides see where
// it came from.

export const shareInput = z.object({
  /** Solution notebooks, and graded exercises' points and hidden tests, go with the copy. */
  solutions: z.boolean(),
});

/** A share link's token: 32 lowercase hex characters (128 random bits). */
export const shareToken = z.string().regex(/^[0-9a-f]{32}$/);

export const copyShareInput = z.object({ token: shareToken, title: courseTitle, academicYear });

/** For the author: the share, if any, and the institutions that copied the course. */
export type CourseShareView = {
  share: { token: string; solutions: boolean } | null;
  copies: { institution: string; academicYear: string; copiedAt: string }[];
};

/** What a share link offers, and where the viewer may copy it. */
export type SharePreview = {
  title: string;
  academicYear: string;
  institution: string;
  solutions: boolean;
  labs: { title: string; notebooks: number }[];
  /** The viewer's institutions where they may create courses. */
  destinations: { slug: string; name: string }[];
};

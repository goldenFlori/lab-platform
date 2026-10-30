import { z } from 'zod';
import { isValidPasswordHash } from './password';

// The platform owner's console (#200): institutions and their first admins, created in the app. The
// app imports only types from this file.

export const newInstitutionInput = z.object({
  name: z.string().trim().min(2).max(120),
  /** Its address in the app: /o/<slug>/… */
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  admin: z.object({
    fullName: z.string().trim().min(1).max(100),
    username: z.string().regex(/^[a-z][a-z0-9.]{1,39}$/),
    passwordHash: z.string().max(200).refine(isValidPasswordHash, 'Not a valid password hash'),
  }),
});
export type NewInstitution = z.infer<typeof newInstitutionInput>;

/** An institution as the owner sees it: counts, never its people's data. */
export type Institution = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  courses: number;
  staff: number;
  students: number;
  /** Students with any activity in the last seven days. */
  activeThisWeek: number;
};

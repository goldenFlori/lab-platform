import { z } from 'zod';
import { LOCALES } from './locale';
import { ORG_ROLES, type OrgRole } from './org-roles';
import { isValidPasswordHash } from './password';

// The institution admin's page (#202): its people and their roles, and its settings. The app imports
// only types from this file.

export { ORG_ROLES, type OrgRole };

/** A person of the institution, as its admin sees them. */
export type OrgPerson = {
  id: string;
  username: string;
  fullName: string;
  /** Their role across the whole institution, if any. */
  orgRole: OrgRole | null;
  /** Courses and groups where they teach (any role but student). */
  teaches: number;
  /** Groups where they are a student. */
  studies: number;
};

export type OrgPeoplePage = { people: OrgPerson[]; next: string | null };

/** A staff account with a role across the institution, its password made in the admin's browser. */
export const orgStaffInput = z.object({
  fullName: z.string().trim().min(1).max(100),
  username: z.string().regex(/^[a-z][a-z0-9.]{1,39}$/),
  role: z.enum(ORG_ROLES),
  passwordHash: z.string().max(200).refine(isValidPasswordHash, 'Not a valid password hash'),
});

/** A role across the institution, or none. */
export const orgRoleInput = z.object({ role: z.enum(ORG_ROLES).nullable() });

export const orgSettingsInput = z.object({
  locale: z.enum(LOCALES).nullable(),
  aiAllowed: z.boolean(),
});
export type OrgSettings = z.infer<typeof orgSettingsInput>;

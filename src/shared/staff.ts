import { z } from 'zod';
import { isValidPasswordHash } from './password';
import { STAFF_ROLES, type StaffRole } from './staff-roles';

// A course's teaching staff (#64): pedagogs and assistants, for the whole course or one group. The
// app imports only types from this file.

export { STAFF_ROLES, type StaffRole };

const scope = { role: z.enum(STAFF_ROLES), groupId: z.string().min(1).max(64).nullable() };

/** An account already in the organization, by username. */
export const addStaffInput = z.object({ username: z.string().trim().min(1).max(64), ...scope });

/** A new account; its password was made and hashed in the pedagog's browser. */
export const createStaffInput = z.object({
  fullName: z.string().trim().min(1).max(100),
  username: z.string().regex(/^[a-z][a-z.]{0,39}$/),
  passwordHash: z.string().max(200).refine(isValidPasswordHash, 'Not a valid password hash'),
  ...scope,
});

export type StaffMember = {
  /** The membership: one person can teach the course and a group separately. */
  id: string;
  userId: string;
  fullName: string;
  username: string;
  role: string;
  /** null: the whole course. */
  groupId: string | null;
};

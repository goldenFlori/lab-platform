import { z } from 'zod';
import { isValidPasswordHash } from './password';
import { IMPORT_CHUNK } from './student-names';

// Request and response shapes for importing students and resetting their passwords (#11).
// Passwords are generated and hashed in the pedagog's browser: only hashes arrive here.
// The app imports only types from this file, so Zod stays out of its bundle.

const passwordHash = z.string().max(200).refine(isValidPasswordHash, 'Not a valid password hash');

export const importStudentsInput = z.object({
  students: z
    .array(
      z.object({
        fullName: z.string().trim().min(1).max(100),
        /** What the name suggests; the server numbers it when taken. */
        username: z.string().regex(/^[a-z][a-z.]{0,39}$/),
        passwordHash,
      }),
    )
    .min(1)
    .max(IMPORT_CHUNK),
});

export const resetPasswordInput = z.object({ passwordHash });

export type GroupStudent = { id: string; fullName: string; username: string };

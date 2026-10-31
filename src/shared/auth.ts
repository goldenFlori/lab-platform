import { z } from 'zod';
import { LOCALES, type Locale } from './locale';

// Shapes shared by the API and the app. The app imports only the types, so Zod stays out of its bundle.

export const loginInput = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

export type LoginInput = z.infer<typeof loginInput>;

/** PATCH /api/me: the user's own settings. */
export const updateMeInput = z.object({ locale: z.enum(LOCALES).nullable() });

/** The signed-in user, from POST /api/auth/login and GET /api/me. */
export type Me = {
  /** locale: the interface language the user chose, or null (#19). */
  user: { id: string; username: string; fullName: string; locale: Locale | null };
  organizations: { id: string; name: string; slug: string }[];
  /** The platform's owner (#200), for the console's link; absent for everyone else. */
  owner?: true;
};

export type ApiErrorCode =
  | 'invalid_request'
  | 'invalid_credentials'
  | 'too_many_attempts'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'daily_limit'
  | 'slug_taken'
  | 'own_account'
  | 'ai_not_allowed'
  | 'username_taken'
  | 'internal';

export type ApiErrorBody = { error: ApiErrorCode };

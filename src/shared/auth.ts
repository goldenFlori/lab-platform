import { z } from 'zod';

// Shapes shared by the API and the app. The app imports only the types, so Zod stays out of its bundle.

export const loginInput = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

export type LoginInput = z.infer<typeof loginInput>;

/** The signed-in user, from POST /api/auth/login and GET /api/me. */
export type Me = {
  user: { id: string; username: string; fullName: string };
  organizations: { id: string; name: string; slug: string }[];
};

export type ApiErrorCode =
  | 'invalid_request'
  | 'invalid_credentials'
  | 'too_many_attempts'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'internal';

export type ApiErrorBody = { error: ApiErrorCode };

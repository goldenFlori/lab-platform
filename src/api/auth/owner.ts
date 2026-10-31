import type { SessionUser } from '../db/auth';

// The platform's owners (#200): named by username in the Worker secret PLATFORM_OWNERS (comma-separated),
// never in the database, so no tenant can become one and no tenant's data says there are any.

export function isOwner(env: unknown, user: SessionUser | null | undefined) {
  const owners = (env as { PLATFORM_OWNERS?: string }).PLATFORM_OWNERS ?? '';
  return !!user && owners.split(',').some((name) => name.trim() === user.username);
}

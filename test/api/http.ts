import { exports } from 'cloudflare:workers';
import { hashPassword } from '../../src/shared/password';
import type { Seeded } from './fixtures';

export const ORIGIN = 'https://lab.test';
const PASSWORD = 'Sakte-sakte-2026';
let hash: Promise<string> | undefined;

type Call = (
  path: string,
  init?: { method?: string; body?: unknown; raw?: BodyInit; headers?: Record<string, string> },
) => Promise<Response>;

/** Calls the real API as a signed-in user (or anonymously without a cookie). */
export function caller(cookie?: string): Call {
  return (path, init = {}) =>
    exports.default.fetch(`${ORIGIN}/api${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Origin: ORIGIN,
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...init.headers,
      },
      body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
    });
}

export async function signIn(username: string) {
  const res = await caller()('/auth/login', { method: 'POST', body: { username, password: PASSWORD } });
  if (res.status !== 200) throw new Error(`Sign-in failed for ${username}: ${res.status}`);
  return `__Host-session=${res.headers.get('Set-Cookie')?.match(/__Host-session=([^;]*)/)?.[1]}`;
}

/**
 * A signed-in account whose only role in the organization is `role`: organization-wide, or only
 * in the given course or group. Pass no role for someone with no membership there at all.
 */
export async function account(seed: Seeded, role?: string, scope: { courseId?: string; groupId?: string } = {}) {
  hash ??= hashPassword(PASSWORD);
  const username = `${role ?? 'nobody'}.${crypto.randomUUID().slice(0, 8)}`;
  const scoped = Boolean(scope.courseId || scope.groupId);
  const user = await seed.tenant.users.create(
    { username, fullName: username, passwordHash: await hash },
    scoped || !role ? 'student' : role,
  );
  const orgWide = (await seed.tenant.memberships.list()).find((m) => m.userId === user.id && !m.courseId && !m.groupId);
  if (role && scoped) await seed.tenant.memberships.create({ userId: user.id, role, ...scope });
  if ((role && scoped) || !role) await seed.tenant.memberships.remove(orgWide?.id as string);
  return { user, call: caller(await signIn(username)) };
}

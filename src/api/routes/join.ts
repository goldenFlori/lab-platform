import { zValidator } from '@hono/zod-validator';
import { type Context, Hono } from 'hono';
import { type JoinResult, joinInput } from '../../shared/courses';
import { normalizeJoinCode } from '../../shared/join-code';
import { LOGIN_WINDOW_SECONDS, MAX_JOIN_FAILURES, windowCutoff } from '../auth/limits';
import { requireUser } from '../auth/session';
import { createDb } from '../db';
import { recentFailures, recordFailures } from '../db/auth';
import { addStudent, findJoinableGroup } from '../db/join';
import type { AppEnv } from '../env';

const invalidRequest = (result: { success: boolean }, c: Context) => {
  if (!result.success) return c.json({ error: 'invalid_request' }, 400);
};

// POST /api/join: a signed-in user becomes a student of the group whose code they typed or scanned.
export const joinRoutes = new Hono<AppEnv>().post(
  '/',
  requireUser,
  zValidator('json', joinInput, invalidRequest),
  async (c) => {
    const userId = c.get('user')?.id as string;
    const db = createDb(c.env.DB);
    const now = new Date();
    const cutoff = windowCutoff(now);
    const key = `join:${userId}`;

    const window = (await recentFailures(db, [key], cutoff)).get(key);
    if (window && window.count >= MAX_JOIN_FAILURES) {
      const endsAt = window.windowStart.getTime() + LOGIN_WINDOW_SECONDS * 1000;
      c.header('Retry-After', String(Math.max(1, Math.ceil((endsAt - now.getTime()) / 1000))));
      return c.json({ error: 'too_many_attempts' }, 429);
    }

    const code = normalizeJoinCode(c.req.valid('json').code);
    const group = code ? await findJoinableGroup(db, code) : undefined;
    if (!group) {
      await recordFailures(db, [key], now, cutoff);
      return c.json({ error: 'not_found' }, 404);
    }

    await addStudent(db, { orgId: group.orgId, groupId: group.groupId, userId });
    return c.json({
      organization: { slug: group.orgSlug, name: group.orgName },
      course: { id: group.courseId, title: group.courseTitle },
      group: { id: group.groupId, name: group.groupName },
    } satisfies JoinResult);
  },
);

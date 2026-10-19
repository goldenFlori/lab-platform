import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createDb } from '../../src/api/db';
import { applyRetention } from '../../src/api/db/platform';
import { daysOf, RETENTION } from '../../src/shared/retention';
import { seedOrganization } from './fixtures';

// #116 is done when the daily job removes only what has passed its period in RETENTION, in every
// organization, a bounded number of rows at a time.

const NOW = new Date('2026-10-18T03:00:00Z');
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const dayAgo = (n: number) => daysAgo(n).toISOString().slice(0, 10);
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
const ACTIVITY = daysOf(RETENTION.activityYears);
const HANDLED = daysOf(RETENTION.handledRequestYears);

const count = async (table: string) =>
  (await env.DB.prepare(`select count(*) as n from ${table}`).first<{ n: number }>())?.n ?? 0;

/** One organization with a row just past and one just within each period. */
async function seedOld(slug: string) {
  const { tenant, org, course, lab, notebook, user } = await seedOrganization(slug);
  for (const [n, kind] of [
    [ACTIVITY + 1, 'view'],
    [ACTIVITY - 1, 'view'],
  ] as const) {
    await tenant.activity.record({ labId: lab.id, userId: user.id, kind, day: dayAgo(n) });
    await tenant.ai.record({ courseId: course.id, userId: user.id, day: dayAgo(n), requests: 1, neurons: 1 });
  }
  for (const n of [RETENTION.aiQuestionDays + 1, RETENTION.aiQuestionDays - 1]) {
    const question = { courseId: course.id, notebookId: notebook.id, userId: user.id, cell: n };
    await tenant.ai.ask({ ...question, code: 'x', error: 'E', answer: 'A' });
    await env.DB.prepare('update ai_questions set created_at = ? where cell = ?')
      .bind(seconds(daysAgo(n)), n)
      .run();
  }
  // Ended Live Labs, and one still running however old.
  for (const n of [ACTIVITY + 1, ACTIVITY - 1, ACTIVITY + 10]) {
    await env.DB.prepare(
      'insert into live_sessions (id, org_id, lab_id, host_id, started_at, ended_at) values (?, ?, ?, ?, ?, ?)',
    )
      .bind(
        crypto.randomUUID(),
        org.id,
        lab.id,
        user.id,
        seconds(daysAgo(n)),
        n === ACTIVITY + 10 ? null : seconds(daysAgo(n)),
      )
      .run();
  }
  // Handled requests, and an open one however old.
  for (const n of [HANDLED + 1, HANDLED - 1, HANDLED + 10]) {
    await env.DB.prepare(
      'insert into deletion_requests (id, org_id, user_id, created_at, handled_at) values (?, ?, ?, ?, ?)',
    )
      .bind(crypto.randomUUID(), org.id, user.id, seconds(daysAgo(n)), n === HANDLED + 10 ? null : seconds(daysAgo(n)))
      .run();
  }
}

describe('the retention schedule (#116)', () => {
  it('deletes only what has passed its period, in every organization', async () => {
    await seedOld('a');
    await seedOld('b');
    await applyRetention(createDb(env.DB), NOW);
    expect(await count('lab_activity')).toBe(2);
    expect(await count('ai_usage')).toBe(2);
    expect(await count('ai_questions')).toBe(2);
    // The recent ended one and the running one stay.
    expect(await count('live_sessions')).toBe(4);
    // The recent handled one and the open one stay.
    expect(await count('deletion_requests')).toBe(4);
    const { results } = await env.DB.prepare('select day from lab_activity').all<{ day: string }>();
    expect(results.every((r) => r.day === dayAgo(ACTIVITY - 1))).toBe(true);
  });

  it('removes a bounded number of rows per table each run, and the rest on the next', async () => {
    await seedOld('a');
    await seedOld('b');
    await applyRetention(createDb(env.DB), NOW, 1);
    expect(await count('lab_activity')).toBe(3);
    expect(await count('deletion_requests')).toBe(5);
    await applyRetention(createDb(env.DB), NOW, 1);
    expect(await count('lab_activity')).toBe(2);
    expect(await count('deletion_requests')).toBe(4);
  });
});

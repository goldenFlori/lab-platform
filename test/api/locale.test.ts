import { describe, expect, it } from 'vitest';
import type { Me } from '../../src/shared/auth';
import type { CourseSummary } from '../../src/shared/courses';
import { seedOrganization } from './fixtures';
import { account, caller } from './http';

// The interface language (#19): each user may choose one, and a course may set one for those who
// have not.

describe("a user's interface language", () => {
  it('is chosen, kept with the account, and cleared again', async () => {
    const seed = await seedOrganization('fshn');
    const { call } = await account(seed, 'student', { groupId: seed.group.id });
    expect(((await (await call('/me')).json()) as Me).user.locale).toBeNull();

    const chosen = await call('/me', { method: 'PATCH', body: { locale: 'en' } });
    expect(chosen.status).toBe(200);
    expect(((await chosen.json()) as Me).user.locale).toBe('en');
    expect(((await (await call('/me')).json()) as Me).user.locale).toBe('en');

    await call('/me', { method: 'PATCH', body: { locale: null } });
    expect(((await (await call('/me')).json()) as Me).user.locale).toBeNull();
  });

  it('accepts only the platform languages, and only from a signed-in user', async () => {
    const seed = await seedOrganization('fshn');
    const { call } = await account(seed, 'student', { groupId: seed.group.id });
    expect((await call('/me', { method: 'PATCH', body: { locale: 'fr' } })).status).toBe(400);
    expect((await caller()('/me', { method: 'PATCH', body: { locale: 'en' } })).status).toBe(401);
  });
});

describe("a course's interface language", () => {
  it('is set by whoever manages the course, and shown to everyone in it', async () => {
    const seed = await seedOrganization('fshn');
    const pedagog = await account(seed, 'pedagog', { courseId: seed.course.id });
    const student = await account(seed, 'student', { groupId: seed.group.id });
    const path = `/orgs/fshn/courses/${seed.course.id}`;

    expect((await student.call(path, { method: 'PATCH', body: { locale: 'en' } })).status).toBe(403);
    const updated = await pedagog.call(path, { method: 'PATCH', body: { locale: 'en' } });
    expect(((await updated.json()) as CourseSummary).locale).toBe('en');
    const seen = (await (await student.call(path)).json()) as { course: CourseSummary };
    expect(seen.course.locale).toBe('en');

    // A new course can be given its language at once.
    const orgPedagog = await account(seed, 'pedagog');
    const made = await orgPedagog.call('/orgs/fshn/courses', {
      method: 'POST',
      body: { title: 'Algorithms', academicYear: '2026/27', locale: 'en' },
    });
    expect(((await made.json()) as CourseSummary).locale).toBe('en');
  });
});

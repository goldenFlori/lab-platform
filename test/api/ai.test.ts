import { describe, expect, it } from 'vitest';
import { AI_DAILY_REQUESTS, type AiStatus, ORG_DAILY_NEURONS } from '../../src/shared/ai';
import type { CourseSummary } from '../../src/shared/courses';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #84 is done when a pedagog turns AI on for a course, a staff request streams an answer, and a
// user over their daily limit gets the limit message without the model being called. Courses with
// AI off and other organizations are refused. (The model is the fake one: vitest.config.ts.)

const ask = { messages: [{ role: 'user', content: 'Një ushtrim për BFS' }] };
const day = () => new Date().toISOString().slice(0, 10);

async function setup() {
  const seed = await seedOrganization('fshn');
  const pedagog = await account(seed, 'pedagog', { courseId: seed.course.id });
  const student = await account(seed, 'student', { groupId: seed.group.id });
  const course = `/orgs/${seed.org.slug}/courses/${seed.course.id}`;
  const status = async (who: typeof student) => (await (await who.call(`${course}/ai`)).json()) as AiStatus;
  return { seed, pedagog, student, course, status };
}

describe('AI in a course', () => {
  it('is off until staff who may configure AI switch it on', async () => {
    const { pedagog, student, course, status } = await setup();
    expect(await status(student)).toEqual({ enabled: false, limit: AI_DAILY_REQUESTS.student, left: 10 });
    expect((await pedagog.call(`${course}/ai/copilot`, { method: 'POST', body: ask })).status).toBe(403);

    expect((await student.call(course, { method: 'PATCH', body: { ai: true } })).status).toBe(403);
    const res = await pedagog.call(course, { method: 'PATCH', body: { ai: true } });
    expect(((await res.json()) as CourseSummary).ai).toBe(true);
    expect((await status(student)).enabled).toBe(true);
  });

  it("streams the copilot's answer to staff only, and counts it", async () => {
    const { seed, pedagog, student, course, status } = await setup();
    await pedagog.call(course, { method: 'PATCH', body: { ai: true } });

    const res = await pedagog.call(`${course}/ai/copilot`, { method: 'POST', body: ask });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toContain('Një ushtrim për BFS');
    expect(await status(pedagog)).toEqual({ enabled: true, limit: AI_DAILY_REQUESTS.staff, left: 49 });

    expect((await student.call(`${course}/ai/copilot`, { method: 'POST', body: ask })).status).toBe(403);
    const other = await seedOrganization('other');
    const outsider = await account(other, 'pedagog', { courseId: other.course.id });
    expect((await outsider.call(`${course}/ai/copilot`, { method: 'POST', body: ask })).status).toBe(404);
    // Each organization counts only its own use.
    expect((await seed.tenant.ai.today(pedagog.user.id, day())).orgNeurons).toBeGreaterThan(0);
    expect((await other.tenant.ai.today(outsider.user.id, day())).orgNeurons).toBe(0);
  });

  it("refuses once the user's or the organization's limit for the day is reached, before calling the model", async () => {
    const { seed, pedagog, course, status } = await setup();
    await pedagog.call(course, { method: 'PATCH', body: { ai: true } });
    const used = { courseId: seed.course.id, day: day(), neurons: 0 };
    await seed.tenant.ai.record({ ...used, userId: pedagog.user.id, requests: AI_DAILY_REQUESTS.staff });

    const res = await pedagog.call(`${course}/ai/copilot`, { method: 'POST', body: ask });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'ai_limit', scope: 'user' });
    expect((await status(pedagog)).left).toBe(0);

    const colleague = await account(seed, 'pedagog', { courseId: seed.course.id });
    await seed.tenant.ai.record({ ...used, userId: colleague.user.id, requests: 1, neurons: ORG_DAILY_NEURONS });
    const late = await colleague.call(`${course}/ai/copilot`, { method: 'POST', body: ask });
    expect(await late.json()).toEqual({ error: 'ai_limit', scope: 'org' });
    expect((await seed.tenant.ai.today(colleague.user.id, day())).requests).toBe(1);
  });
});

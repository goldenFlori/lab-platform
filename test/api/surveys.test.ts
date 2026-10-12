import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { SurveyView } from '../../src/shared/surveys';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #102 is done when six students answer, staff see averages and comments, a student cannot answer
// twice, and nothing links an answer to a student.

const at = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

async function setup() {
  const seed = await seedOrganization('fshn');
  const pedagog = await account(seed, 'pedagog', { courseId: seed.course.id });
  const students = await Promise.all(
    Array.from({ length: 6 }, () => account(seed, 'student', { groupId: seed.group.id })),
  );
  const path = `/orgs/${seed.org.slug}/courses/${seed.course.id}/survey`;
  const view = async (who: typeof pedagog) => (await (await who.call(path)).json()) as SurveyView;
  return { seed, pedagog, students, path, view };
}

describe('the end-of-semester survey', () => {
  it('is opened by staff, answered once by each student, and read as totals from five answers', async () => {
    const { pedagog, students, path, view } = await setup();
    const [ana, besa] = students as [(typeof students)[0], (typeof students)[0]];
    expect((await ana.call(path, { method: 'PUT', body: { closesAt: at(3600) } })).status).toBe(403);
    expect((await pedagog.call(path, { method: 'PUT', body: { closesAt: at(3600) } })).status).toBe(204);
    expect(await view(ana)).toMatchObject({ canAnswer: true, answered: false, results: null });

    const answer = (code: number, comment?: string) => ({ ratings: { code, visualizations: 4 }, comment });
    for (const [i, student] of students.slice(0, 4).entries()) {
      expect(
        (await student.call(`${path}/answers`, { method: 'POST', body: answer(5 - (i % 2), `Koment ${i}`) })).status,
      ).toBe(204);
    }
    // Four answers: nothing to read yet.
    expect((await view(pedagog)).results).toMatchObject({ respondents: 4, students: 6, enough: false, comments: [] });

    expect((await ana.call(`${path}/answers`, { method: 'POST', body: answer(1) })).status).toBe(409);
    expect(await view(ana)).toMatchObject({ canAnswer: false, answered: true });
    expect((await pedagog.call(`${path}/answers`, { method: 'POST', body: answer(1) })).status).toBe(403);
    for (const student of students.slice(4)) await student.call(`${path}/answers`, { method: 'POST', body: answer(3) });

    const results = (await view(pedagog)).results;
    expect(results).toMatchObject({ respondents: 6, enough: true });
    expect(results?.questions.find((q) => q.question === 'code')).toEqual({ question: 'code', answers: 6, average: 4 });
    expect(results?.questions.find((q) => q.question === 'live')).toEqual({
      question: 'live',
      answers: 0,
      average: null,
    });
    expect([...(results?.comments ?? [])].sort()).toEqual(['Koment 0', 'Koment 1', 'Koment 2', 'Koment 3']);
    expect(await view(besa)).toMatchObject({ results: null });

    // Closed: no more answers.
    await pedagog.call(path, { method: 'PUT', body: { closesAt: at(-60) } });
    expect((await view(besa)).survey?.open).toBe(false);
    // Six students and their sign-ins: quick here, slower on a busy CI runner.
  }, 30_000);

  it('keeps nothing that links an answer to a student', async () => {
    const tables = await env.DB.prepare(
      "select name, sql from sqlite_master where type = 'table' and name in ('survey_ratings', 'survey_comments', 'survey_respondents')",
    ).all<{ name: string; sql: string }>();
    const sql = Object.fromEntries(tables.results.map((t) => [t.name, t.sql]));
    // Ratings are counts and comments have no author or time; who answered is kept apart.
    for (const name of ['survey_ratings', 'survey_comments']) expect(sql[name]).not.toMatch(/user_id|created_at/);
    // Stored by their key, not by when they were written, so their order cannot be matched.
    expect(sql.survey_comments).toContain('WITHOUT ROWID');
    expect(sql.survey_respondents).toContain('WITHOUT ROWID');
  });
});

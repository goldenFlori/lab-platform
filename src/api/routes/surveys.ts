import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { SURVEY_MIN_ANSWERS, SURVEY_QUESTIONS } from '../../shared/survey-questions';
import { type SurveyResults, type SurveyView, surveyAnswerInput, surveyInput } from '../../shared/surveys';
import type { TenantEnv } from '../auth/access';
import { forbidden, invalidRequest, visibleCourse } from './course-context';

// The end-of-semester survey (#102), under /api/orgs/:org/courses/:courseId/survey. Staff who manage
// the course open it until a date; each student of the course answers once, anonymously; staff with
// the course's analytics see the totals, and only from SURVEY_MIN_ANSWERS answers.

export const surveyRoutes = new Hono<TenantEnv>()
  .get('/', async (c) => {
    const { course, groups } = await visibleCourse(c);
    const { access, tenant } = c.var;
    const survey = await tenant.surveys.ofCourse(course.id);
    const student = groups.some((g) => access.can('submission.create', { courseId: course.id, groupId: g.id }));
    const open = survey ? survey.closesAt.getTime() > Date.now() : false;
    const answered = survey && student ? await tenant.surveys.answered(survey.id, c.var.user?.id as string) : false;
    const staff =
      access.can('analytics.view', { courseId: course.id }) || access.can('course.manage', { courseId: course.id });

    let results: SurveyResults | null = null;
    if (survey && staff) {
      const [totals, students] = await Promise.all([
        tenant.surveys.results(survey.id),
        tenant.surveys.students(course.id),
      ]);
      const enough = totals.respondents >= SURVEY_MIN_ANSWERS;
      results = {
        respondents: totals.respondents,
        students,
        enough,
        questions: SURVEY_QUESTIONS.map((question) => {
          const rows = totals.ratings.filter((r) => r.question === question);
          const answers = rows.reduce((n, r) => n + r.n, 0);
          const sum = rows.reduce((n, r) => n + r.score * r.n, 0);
          return { question, answers: enough ? answers : 0, average: enough && answers ? sum / answers : null };
        }),
        comments: enough ? totals.comments : [],
      };
    }
    return c.json({
      survey: survey ? { closesAt: survey.closesAt.toISOString(), open } : null,
      canAnswer: student && open && !answered,
      answered,
      results,
    } satisfies SurveyView);
  })

  // Opens it until `closesAt`, or moves the closing (a date in the past closes it).
  .put('/', zValidator('json', surveyInput, invalidRequest), async (c) => {
    const { course } = await visibleCourse(c);
    if (!c.var.access.can('course.manage', { courseId: course.id })) return forbidden(c);
    await c.var.tenant.surveys.open(course.id, new Date(c.req.valid('json').closesAt));
    return c.body(null, 204);
  })

  // A student's answer, once.
  .post('/answers', zValidator('json', surveyAnswerInput, invalidRequest), async (c) => {
    const { course, groups } = await visibleCourse(c);
    const { access, tenant } = c.var;
    if (!groups.some((g) => access.can('submission.create', { courseId: course.id, groupId: g.id })))
      return forbidden(c);
    const survey = await tenant.surveys.ofCourse(course.id);
    if (!survey || survey.closesAt.getTime() <= Date.now()) return c.json({ error: 'closed' }, 409);
    const { ratings, comment } = c.req.valid('json');
    const given = Object.entries(ratings).filter((entry): entry is [string, number] => typeof entry[1] === 'number');
    const recorded = await tenant.surveys.answer(survey.id, c.var.user?.id as string, given, comment || null);
    return recorded ? c.body(null, 204) : c.json({ error: 'already_answered' }, 409);
  });

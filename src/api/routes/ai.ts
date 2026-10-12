import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { type AiQuestion, type AiStatus, copilotInput, quizInput, translateInput, variantInput } from '../../shared/ai';
import { dailyLimit, streamAi, today } from '../ai/gateway';
import { copilotSystem, quizMessages, translateMessages, variantMessages } from '../ai/purposes';
import type { TenantEnv } from '../auth/access';
import { forbidden, invalidRequest, visibleCourse } from './course-context';

// AI in a course, under /api/orgs/:org/courses/:courseId/ai (#84). Staff who may publish labs get
// the staff quota and the copilot.

export const aiRoutes = new Hono<TenantEnv>()
  .get('/', async (c) => {
    const { course } = await visibleCourse(c);
    const limit = dailyLimit(c.var.access.can('lab.publish', { courseId: course.id }));
    const { requests } = await c.var.tenant.ai.today(c.var.user?.id as string, today());
    return c.json({ enabled: course.aiEnabled, limit, left: Math.max(0, limit - requests) } satisfies AiStatus);
  })

  .post('/copilot', zValidator('json', copilotInput, invalidRequest), async (c) => {
    const { course } = await visibleCourse(c);
    if (!c.var.access.can('lab.publish', { courseId: course.id })) return forbidden(c);
    const messages = [copilotSystem(course.title, course.locale), ...c.req.valid('json').messages];
    return streamAi(c, { course, staff: true, purpose: 'copilot', messages });
  })

  // Students' "Explain my error" questions (#86), for staff who review their groups.
  .get('/questions', async (c) => {
    const { course, groups } = await visibleCourse(c);
    const { access } = c.var;
    const courseId = course.id;
    const whole = access.can('submission.review', { courseId });
    const allowed = groups.filter((g) => access.can('submission.review', { courseId, groupId: g.id }));
    if (!whole && allowed.length === 0) return forbidden(c);
    const questions = await c.var.tenant.ai.questions(courseId, whole ? null : allowed.map((g) => g.id));
    return c.json(questions satisfies AiQuestion[]);
  })

  // A variant of an exercise (#85), written under fixed headings that the browser reads.
  .post('/variant', zValidator('json', variantInput, invalidRequest), async (c) => {
    const { course } = await visibleCourse(c);
    if (!c.var.access.can('lab.publish', { courseId: course.id })) return forbidden(c);
    const messages = variantMessages(c.req.valid('json'), course.locale);
    return streamAi(c, { course, staff: true, purpose: 'variant', messages });
  })

  // Three quick questions (#87) on the part of the lab being presented, for a Live Lab.
  .post('/quiz', zValidator('json', quizInput, invalidRequest), async (c) => {
    const { course } = await visibleCourse(c);
    if (!c.var.access.can('lab.publish', { courseId: course.id })) return forbidden(c);
    const messages = quizMessages(c.req.valid('json'), course.locale);
    return streamAi(c, { course, staff: true, purpose: 'quiz', messages });
  })

  // Parts of a notebook translated (#88); the browser sends a notebook in several requests.
  .post('/translate', zValidator('json', translateInput, invalidRequest), async (c) => {
    const { course } = await visibleCourse(c);
    if (!c.var.access.can('lab.publish', { courseId: course.id })) return forbidden(c);
    return streamAi(c, { course, staff: true, purpose: 'translate', messages: translateMessages(c.req.valid('json')) });
  });

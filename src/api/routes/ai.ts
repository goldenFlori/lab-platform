import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { type AiStatus, copilotInput, variantInput } from '../../shared/ai';
import { dailyLimit, streamAi, today } from '../ai/gateway';
import { copilotSystem, variantMessages } from '../ai/purposes';
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

  // A variant of an exercise (#85), written under fixed headings that the browser reads.
  .post('/variant', zValidator('json', variantInput, invalidRequest), async (c) => {
    const { course } = await visibleCourse(c);
    if (!c.var.access.can('lab.publish', { courseId: course.id })) return forbidden(c);
    const messages = variantMessages(c.req.valid('json'), course.locale);
    return streamAi(c, { course, staff: true, purpose: 'variant', messages });
  });

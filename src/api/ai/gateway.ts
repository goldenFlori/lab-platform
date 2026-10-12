import type { Context } from 'hono';
import { AI_DAILY_REQUESTS, type AiRefusal, ORG_DAILY_NEURONS } from '../../shared/ai';
import type { TenantEnv } from '../auth/access';
import { AiQuotaError, type ChatMessage, provider } from './provider';
import { estimateNeurons, PURPOSES, type Purpose } from './purposes';

// Every AI call goes through here (#84): AI must be on for the course, and the user's daily
// requests and the organization's share of the free allocation are checked and reserved before
// the model runs. The answer streams to the browser as plain text; the Worker only passes it on,
// so waiting for the model costs no CPU time.

export const today = () => new Date().toISOString().slice(0, 10);

export const dailyLimit = (staff: boolean) => (staff ? AI_DAILY_REQUESTS.staff : AI_DAILY_REQUESTS.student);

const refuse = (c: Context, refusal: AiRefusal, status: 403 | 429 | 503) => c.json(refusal, status);

export async function streamAi(
  c: Context<TenantEnv>,
  request: { course: { id: string; aiEnabled: boolean }; staff: boolean; purpose: Purpose; messages: ChatMessage[] },
) {
  const { course, staff, purpose, messages } = request;
  if (!course.aiEnabled) return refuse(c, { error: 'ai_off' }, 403);
  const { tenant } = c.var;
  const userId = c.var.user?.id as string;
  const day = today();
  const usage = await tenant.ai.today(userId, day);
  if (usage.requests >= dailyLimit(staff)) return refuse(c, { error: 'ai_limit', scope: 'user' }, 429);
  if (usage.orgNeurons >= ORG_DAILY_NEURONS) return refuse(c, { error: 'ai_limit', scope: 'org' }, 429);

  const reserved = estimateNeurons(purpose, messages);
  const record = (requests: number, neurons: number) =>
    tenant.ai.record({ courseId: course.id, userId, day, requests, neurons });
  await record(1, reserved);

  const { model, maxTokens } = PURPOSES[purpose];
  let answer: Awaited<ReturnType<ReturnType<typeof provider>['stream']>>;
  try {
    answer = await provider(c.env).stream(model, messages, maxTokens);
  } catch (error) {
    await record(-1, -reserved);
    if (error instanceof AiQuotaError) return refuse(c, { error: 'ai_limit', scope: 'org' }, 429);
    console.error('AI call failed', error);
    return refuse(c, { error: 'ai_unavailable' }, 503);
  }

  const ctx = c.executionCtx;
  const body = answer.text
    .pipeThrough(
      new TransformStream<string, string>({
        // Once the answer has ended, count what it really used instead of the reservation.
        flush() {
          const used = answer.neurons();
          if (used !== null) ctx.waitUntil(record(0, used - reserved));
        },
      }),
    )
    .pipeThrough(new TextEncoderStream());
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

import { z } from 'zod';
import { MAX_TEST } from './exercise-limits';

// AI in a course (#84): the switch, the quotas and the copilot's request. Every call runs on
// Workers AI's free daily allocation (10,000 neurons for the whole platform).

/** Requests per user and day, across the organization's courses. Staff may publish labs. */
export const AI_DAILY_REQUESTS = { staff: 50, student: 10 } as const;

/** An organization's share of the free daily allocation, in neurons. */
export const ORG_DAILY_NEURONS = 9000;

/** What the user has left today in this course. */
export type AiStatus = { enabled: boolean; limit: number; left: number };

/** Why a request was refused: AI is off, or a limit is reached (the user's, or today's for everyone). */
export type AiRefusal =
  | { error: 'ai_off' }
  | { error: 'ai_limit'; scope: 'user' | 'org' }
  | { error: 'ai_unavailable' };

const message = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
});

/** A staff conversation with the copilot: the newest message last, and from the user. */
export const copilotInput = z.object({
  messages: z
    .array(message)
    .min(1)
    .max(12)
    .refine((list) => list.at(-1)?.role === 'user'),
});

export type CopilotInput = z.infer<typeof copilotInput>;

/** An exercise to make a variant of (#85): its title, statement, code cell and visible test. */
export const variantInput = z.object({
  title: z.string().trim().min(1).max(160),
  statement: z.string().max(4000),
  code: z.string().min(1).max(8000),
  test: z.string().max(MAX_TEST).nullable(),
});

export type VariantInput = z.infer<typeof variantInput>;

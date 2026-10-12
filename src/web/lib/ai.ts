import { queryOptions } from '@tanstack/react-query';
import type { AiRefusal, AiStatus } from '../../shared/ai';
import type { Messages } from '../i18n';
import { api } from './api';

// AI in a course (#84): what the user has left today, and the answers, read as they are written.

const aiPath = (org: string, courseId: string) =>
  `/orgs/${encodeURIComponent(org)}/courses/${encodeURIComponent(courseId)}/ai`;

export const aiStatusQuery = (org: string, courseId: string) =>
  queryOptions({
    queryKey: ['orgs', org, 'courses', courseId, 'ai'],
    queryFn: () => api<AiStatus>(aiPath(org, courseId)),
  });

/** A refused or failed AI request. */
export class AiError extends Error {
  constructor(readonly refusal: AiRefusal | { error: 'network' }) {
    super(refusal.error);
  }
}

/** Sends a request and calls `onText` with the whole answer so far, each time more arrives. */
export async function streamAi(
  org: string,
  courseId: string,
  purpose: string,
  body: unknown,
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`/api${aiPath(org, courseId)}/${purpose}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new AiError({ error: 'network' });
  }
  if (!res.ok || !res.body) {
    const refusal = (await res.json().catch(() => null)) as AiRefusal | null;
    throw new AiError(refusal?.error ? refusal : { error: 'ai_unavailable' });
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += value;
      onText(text);
    }
  } catch {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw new AiError({ error: 'network' });
  }
  return text;
}

/** Why an AI request did not work, in words for the user. */
export function aiErrorText(t: Messages, error: unknown) {
  if (!(error instanceof AiError)) return t.ai.unavailable;
  const { refusal } = error;
  if (refusal.error === 'ai_off') return t.ai.off;
  if (refusal.error === 'ai_limit') return refusal.scope === 'user' ? t.ai.limitUser : t.ai.limitOrg;
  if (refusal.error === 'network') return t.ai.network;
  return t.ai.unavailable;
}

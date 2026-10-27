import type { ApiErrorBody, ApiErrorCode } from '../../shared/auth';
import { reportService } from './service';

/** A failed API call, with the server's error code and any Retry-After seconds. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | 'network',
    readonly retryAfterSeconds?: number,
  ) {
    super(`API error ${status}: ${code}`);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    reportService(null);
    throw new ApiError(0, 'network');
  }
  reportService(res);

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    const retryAfter = Number(res.headers.get('Retry-After'));
    throw new ApiError(res.status, body?.error ?? 'internal', Number.isFinite(retryAfter) ? retryAfter : undefined);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

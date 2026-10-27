import { useSyncExternalStore } from 'react';

// Whether the platform can be reached (#178): 'offline' when the network fails, 'limit' when the free
// plan's daily limits are used up (D1 answers daily_limit; past the requests limit Cloudflare answers
// with its own 1027 page, not JSON). Every API answer reports here; any answer that went through puts
// it back to 'ok'. One banner says it once, instead of every screen failing on its own.

export type Service = 'ok' | 'offline' | 'limit';

let state: Service = 'ok';
const listeners = new Set<() => void>();

function set(next: Service) {
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener();
}

/** What a response says about the platform, before its body is read. */
export function serviceOf(res: Response): Service | null {
  if (res.ok) return 'ok';
  if (res.status === 503 && res.headers.get('Retry-After')) return 'limit';
  // Cloudflare's own error page for the requests limit (1027) is HTML, never our JSON.
  if (res.status === 429 && !res.headers.get('Content-Type')?.includes('application/json')) return 'limit';
  return null;
}

/** Reports a response, or a network failure (null). */
export function reportService(res: Response | null) {
  const next = res ? serviceOf(res) : 'offline';
  if (next) set(next);
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => set('offline'));
}

/** The state now, for code that runs after an answer rather than on render. */
export const currentService = () => state;

export function useService(): Service {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/** When the free plan's limits reset: midnight UTC, in this browser's time. */
export function nextReset(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

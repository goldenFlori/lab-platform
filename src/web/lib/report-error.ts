import type { ClientError } from '../../shared/client-errors';
import { ApiError } from './api';

// Errors in the browser reach the owner (#179): uncaught errors and rejections, and what the error
// boundaries catch, sent to /api/client-errors and kept 3 days in Workers Logs. Only where and what:
// the page as its route (no ids), the message with ids masked, the place in the app's own code, the
// build. Never who, nor their code or answers. At most MAX_REPORTS a page load, each message once.
// API failures are not reported: the server sees and logs those itself.

const MAX_REPORTS = 10;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** Noise every browser makes now and then, and errors from scripts that are not ours. */
const IGNORED = [/^ResizeObserver loop/, /^Script error\.?$/];

let pageOf = () => location.pathname.replace(UUID, ':id');
const sent = new Set<string>();

/** The app's build, from its script's name: "index-1a2b3c". */
function build() {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.src ?? '';
  return src.split('/').pop()?.replace(/\.js$/, '') || 'dev';
}

/** "/assets/index-1a2b3c.js:1:2345": the first place in the app's own code, never another site's. */
function sourceOf(stack: string | undefined) {
  const at = stack?.match(/(https?:\/\/[^\s)]+):(\d+):(\d+)/);
  const url = at?.[1];
  if (!at || !url?.startsWith(location.origin)) return null;
  return `${url.slice(location.origin.length)}:${at[2]}:${at[3]}`.slice(0, 200);
}

export function reportError(kind: ClientError['kind'], error: unknown, source?: string | null) {
  if (error instanceof ApiError) return;
  const message = (error instanceof Error ? error.message : String(error)).replace(UUID, ':id').slice(0, 300);
  if (!message || IGNORED.some((pattern) => pattern.test(message))) return;
  const key = `${kind}|${message}`;
  if (sent.has(key) || sent.size >= MAX_REPORTS) return;
  sent.add(key);
  const report: ClientError = {
    kind,
    message,
    source: source ?? sourceOf(error instanceof Error ? error.stack : undefined),
    page: pageOf().slice(0, 200),
    build: build().slice(0, 60),
  };
  void fetch('/api/client-errors', {
    method: 'POST',
    keepalive: true,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  }).catch(() => {});
}

/** Starts reporting; `page` names the page on screen by its route. */
export function startErrorReports(page: () => string | undefined) {
  pageOf = () => page() ?? location.pathname.replace(UUID, ':id');
  window.addEventListener('error', (event) => {
    // Only the app's own scripts: an extension's error is not ours to fix.
    const ours = event.filename?.startsWith(location.origin);
    if (!ours) return;
    const where = `${event.filename.slice(location.origin.length)}:${event.lineno}:${event.colno}`;
    reportError('error', event.error ?? event.message, where);
  });
  window.addEventListener('unhandledrejection', (event) => reportError('rejection', event.reason));
}

// Errors as they happen in production (#179):
//
//   npm run errors
//
// Follows the live Worker's logs (wrangler tail, with the owner's `wrangler login`) and prints one line
// per browser error (from /api/client-errors) and per server exception or error log. It prints only
// what the report says; never a request's address, IP or headers. The last 3 days are in the
// Cloudflare dashboard: Workers → lab-platform → Observability, filtered on type = client_error.

import { spawn } from 'node:child_process';

type TailEvent = {
  eventTimestamp?: number;
  logs?: { message?: unknown[]; level?: string; timestamp?: number }[];
  exceptions?: { name?: string; message?: string; timestamp?: number }[];
};

const time = (ms: number | undefined) => new Date(ms ?? Date.now()).toLocaleTimeString('en-GB');

/** The lines worth reading in one tail event: browser errors, then the server's own. */
export function linesOf(event: TailEvent): string[] {
  const lines: string[] = [];
  for (const log of event.logs ?? []) {
    const first = log.message?.[0];
    if (typeof first === 'string' && first.startsWith('{"type":"client_error"')) {
      try {
        const e = JSON.parse(first) as Record<string, string | null>;
        lines.push(
          `${time(log.timestamp)}  browser  ${e.kind} on ${e.page} (${e.browser ?? 'unknown browser'}, ${e.build})\n` +
            `          ${e.message}${e.source ? `\n          at ${e.source}` : ''}`,
        );
      } catch {
        // Not one of ours after all.
      }
    } else if (log.level === 'error') {
      const text = (log.message ?? []).map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join(' ');
      lines.push(`${time(log.timestamp)}  server   ${text.slice(0, 500)}`);
    }
  }
  for (const e of event.exceptions ?? []) {
    lines.push(`${time(e.timestamp)}  server   ${e.name ?? 'Error'}: ${e.message ?? ''}`);
  }
  return lines;
}

/** Whole JSON objects out of a stream that may split or join them anywhere. */
export function jsonObjects() {
  let buffer = '';
  return (chunk: string): unknown[] => {
    buffer += chunk;
    const found: unknown[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let consumed = 0;
    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer[i];
      if (inString) {
        if (ch === '\\') i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') {
        if (depth++ === 0) start = i;
      } else if (ch === '}' && depth > 0 && --depth === 0) {
        try {
          found.push(JSON.parse(buffer.slice(start, i + 1)));
        } catch {
          // A line that only looked like JSON.
        }
        consumed = i + 1;
      }
    }
    buffer = depth === 0 ? '' : buffer.slice(consumed);
    return found;
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Following lab-platform’s errors (Ctrl+C to stop)…\n');
  const tail = spawn('npx', ['wrangler', 'tail', 'lab-platform', '--format', 'json'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const next = jsonObjects();
  tail.stdout.setEncoding('utf8');
  tail.stdout.on('data', (chunk: string) => {
    for (const event of next(chunk)) for (const line of linesOf(event as TailEvent)) console.log(line);
  });
  tail.on('exit', (code) => process.exit(code ?? 0));
}

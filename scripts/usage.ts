// Today's use of Cloudflare's free plan (#180):
//
//   CLOUDFLARE_ANALYTICS_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… npm run usage [-- --warn-at 70]
//
// Reads today's (UTC) Worker requests and D1 rows read and written from Cloudflare's GraphQL
// Analytics API, for the whole account (the limits are per account), and compares them with the free
// plan's daily limits. It exits with 1 from --warn-at percent of any limit, so the scheduled workflow
// (.github/workflows/usage.yml) fails and GitHub emails the owner before students are refused. The
// token needs only "Account Analytics: Read".

import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

/** The free plan's daily limits (re-checked 2026-10-27; see platform-architecture). */
export const LIMITS = { requests: 100_000, rowsRead: 5_000_000, rowsWritten: 100_000 } as const;

export type Usage = { requests: number; rowsRead: number; rowsWritten: number };

const QUERY = `query Usage($account: string!, $since: Time!, $until: Time!, $day: Date!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: $since, datetime_leq: $until }) {
        sum { requests }
      }
      d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date_geq: $day, date_leq: $day }) {
        sum { rowsRead rowsWritten }
      }
    }
  }
}`;

type Answer = {
  data?: {
    viewer?: {
      accounts?: {
        workersInvocationsAdaptive?: { sum?: { requests?: number } }[];
        d1AnalyticsAdaptiveGroups?: { sum?: { rowsRead?: number; rowsWritten?: number } }[];
      }[];
    };
  };
  errors?: { message: string }[] | null;
};

/** Today's totals from the API's answer, summed over every Worker and database of the account. */
export function usageOf(answer: Answer): Usage {
  if (answer.errors?.length) throw new Error(answer.errors.map((e) => e.message).join('; '));
  const account = answer.data?.viewer?.accounts?.[0];
  if (!account) throw new Error('The account was not found: check CLOUDFLARE_ACCOUNT_ID and the token.');
  const sum = <T>(rows: T[] | undefined, value: (row: T) => number | undefined) =>
    (rows ?? []).reduce((n, row) => n + (value(row) ?? 0), 0);
  return {
    requests: sum(account.workersInvocationsAdaptive, (r) => r.sum?.requests),
    rowsRead: sum(account.d1AnalyticsAdaptiveGroups, (r) => r.sum?.rowsRead),
    rowsWritten: sum(account.d1AnalyticsAdaptiveGroups, (r) => r.sum?.rowsWritten),
  };
}

/** Each limit's share used, and whether any reaches `warnAt` percent. */
export function report(usage: Usage, warnAt: number) {
  const rows = (Object.keys(LIMITS) as (keyof Usage)[]).map((key) => {
    const percent = (100 * usage[key]) / LIMITS[key];
    return { key, used: usage[key], limit: LIMITS[key], percent, over: percent >= warnAt };
  });
  return { rows, warn: rows.some((r) => r.over) };
}

const NAMES: Record<keyof Usage, string> = {
  requests: 'Worker requests',
  rowsRead: 'D1 rows read',
  rowsWritten: 'D1 rows written',
};

export function markdown(r: ReturnType<typeof report>, day: string, warnAt: number) {
  return [
    `### Free plan use on ${day} (UTC, so far)`,
    '',
    '| | used | daily limit | share |',
    '|---|---:|---:|---:|',
    ...r.rows.map(
      (row) =>
        `| ${NAMES[row.key]} | ${row.used.toLocaleString('en')} | ${row.limit.toLocaleString('en')} | ${row.over ? '**' : ''}${row.percent.toFixed(1)}%${row.over ? '**' : ''} |`,
    ),
    '',
    r.warn
      ? `**Warning:** ${warnAt}% or more of a daily limit is used. Past 100%, requests or database queries are refused until midnight UTC.`
      : `Below ${warnAt}% of every limit.`,
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { 'warn-at': { type: 'string', default: '70' } } });
  const warnAt = Number(values['warn-at']);
  const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) {
    // Not set up yet: say so where it shows (a warning in the workflow), without failing it.
    console.log('::warning::CLOUDFLARE_ANALYTICS_TOKEN or CLOUDFLARE_ACCOUNT_ID is not set: no usage was read.');
    process.exit(0);
  }
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: QUERY,
      variables: { account, since: `${day}T00:00:00Z`, until: now.toISOString(), day },
    }),
  });
  if (!res.ok) {
    console.error(`✖ Cloudflare answered ${res.status}: ${await res.text()}`);
    process.exit(2);
  }
  const r = report(usageOf((await res.json()) as Answer), warnAt);
  const text = markdown(r, day, warnAt);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  process.exit(r.warn ? 1 : 0);
}

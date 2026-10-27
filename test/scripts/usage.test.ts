import { describe, expect, it } from 'vitest';
import { markdown, report, usageOf } from '../../scripts/usage';

// #180: today's use of the free plan, summed over the account, and a warning from 70% of a limit.

const answer = (requests: number[], d1: [number, number][]) => ({
  data: {
    viewer: {
      accounts: [
        {
          workersInvocationsAdaptive: requests.map((r) => ({ sum: { requests: r } })),
          d1AnalyticsAdaptiveGroups: d1.map(([rowsRead, rowsWritten]) => ({ sum: { rowsRead, rowsWritten } })),
        },
      ],
    },
  },
  errors: null,
});

describe('npm run usage', () => {
  it('sums every Worker and database of the account', () => {
    expect(
      usageOf(
        answer(
          [40_000, 2_000],
          [
            [1_000_000, 30_000],
            [5_000, 1_000],
          ],
        ),
      ),
    ).toEqual({
      requests: 42_000,
      rowsRead: 1_005_000,
      rowsWritten: 31_000,
    });
    expect(usageOf(answer([], []))).toEqual({ requests: 0, rowsRead: 0, rowsWritten: 0 });
  });

  it('warns from the given share of any limit', () => {
    const quiet = report({ requests: 18_000, rowsRead: 800_000, rowsWritten: 33_000 }, 70);
    expect(quiet.warn).toBe(false);
    const busy = report({ requests: 18_000, rowsRead: 800_000, rowsWritten: 71_000 }, 70);
    expect(busy.warn).toBe(true);
    expect(busy.rows.find((r) => r.key === 'rowsWritten')).toMatchObject({ percent: 71, over: true });
    expect(markdown(busy, '2026-10-27', 70)).toContain('| D1 rows written | 71,000 | 100,000 | **71.0%** |');
  });

  it('says what went wrong instead of reading zero', () => {
    expect(() => usageOf({ errors: [{ message: 'not authorized for that account' }] })).toThrow('not authorized');
    expect(() => usageOf({ data: { viewer: { accounts: [] } }, errors: null })).toThrow('account was not found');
  });
});

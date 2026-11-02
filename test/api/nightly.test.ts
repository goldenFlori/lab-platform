import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { recordJobRun } from '../../src/api/db/platform';
import { runNightly } from '../../src/api/nightly';
import type { Institution, JobRun } from '../../src/shared/platform';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #228: the nightly job records each run and what each step did; the owner's console shows the last
// runs, and what each institution has imported.

describe('the nightly job', () => {
  it('records its run, step by step, for the owner to see', async () => {
    const seed = await seedOrganization('fshn');
    const { ok, steps } = await runNightly(env);
    expect(ok).toBe(true);
    expect(steps).toMatchObject({ sessions: 'ok', demo: 'no demo institution' });
    expect(steps.retention).toMatch(/^\d+ rows deleted$/);

    const owner = await account(seed, 'admin', {}, 'owner.test');
    const runs = ((await (await owner.call('/platform/jobs')).json()) as { runs: JobRun[] }).runs;
    expect(runs[0]).toMatchObject({ ok: true, steps });
    const admin = await account(seed, 'admin');
    expect((await admin.call('/platform/jobs')).status).toBe(404);

    // What the institution has imported: the seed's lab and its ready notebook.
    const list = (await (await owner.call('/platform/institutions')).json()) as { institutions: Institution[] };
    expect(list.institutions.find((i) => i.slug === 'fshn')).toMatchObject({ labs: 1, notebooks: 1 });
  });

  it('keeps only the last 30 runs', async () => {
    const seed = await seedOrganization('fshn');
    for (let i = 0; i < 32; i++) {
      const at = new Date(Date.UTC(2026, 9, 1 + i, 2, 30));
      await recordJobRun(seed.db, { job: 'nightly', startedAt: at, finishedAt: at, ok: true, steps: { n: String(i) } });
    }
    const owner = await account(seed, 'admin', {}, 'owner.test');
    const runs = ((await (await owner.call('/platform/jobs')).json()) as { runs: JobRun[] }).runs;
    expect(runs).toHaveLength(7);
    expect(runs[0]?.steps).toEqual({ n: '31' });
    const all = await seed.db.$client.prepare('SELECT COUNT(*) AS n FROM job_runs').first<{ n: number }>();
    expect(all?.n).toBe(30);
  });
});

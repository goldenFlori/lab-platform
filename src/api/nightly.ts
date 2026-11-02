import { cleanUpExpired } from './auth/session';
import { createDb } from './db';
import { resetDemo } from './db/demo';
import { applyRetention, recordJobRun } from './db/platform';

// The nightly job (see triggers in wrangler.jsonc): sign-ins that expired, what has passed its
// retention period (#116), and the demo institution rebuilt (#216). Each step runs on its own, so one
// failing does not stop the others, and the run is recorded with what each did (#228): the owner's
// console shows it, so a job that stopped working does not go unnoticed.
export async function runNightly(env: Env, now = new Date()) {
  const db = createDb(env.DB);
  const steps: Record<string, string> = {};
  let ok = true;
  const step = async (name: string, work: () => Promise<string>) => {
    try {
      steps[name] = await work();
    } catch (error) {
      ok = false;
      steps[name] = `failed: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`;
      console.error(`Nightly step ${name} failed`, error);
    }
  };
  await step('sessions', async () => {
    await cleanUpExpired(env, now);
    return 'ok';
  });
  await step('retention', async () => `${await applyRetention(db, now)} rows deleted`);
  await step('demo', async () => ((await resetDemo(db, now)) ? 'rebuilt' : 'no demo institution'));
  await recordJobRun(db, { job: 'nightly', startedAt: now, finishedAt: new Date(), ok, steps });
  return { ok, steps };
}

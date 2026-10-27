import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createDb } from '../../src/api/db';
import { grantsOf } from '../../src/api/db/access';
import { emptyTally, meterD1 } from '../../src/api/db/meter';
import { forTenant } from '../../src/api/db/tenant';
import { seedOrganization } from './fixtures';

// #176: the meter counts what the free plan counts, and a student's saves stay within the budget
// (platform-architecture, "Measured budget"): a first save writes its row and its two indexes, a
// later one only the row.

async function metered() {
  const seed = await seedOrganization('fshn');
  const student = await seed.tenant.users.create({ username: 'ana', fullName: 'Ana', passwordHash: 'x' }, 'student');
  const tally = emptyTally();
  const tenant = forTenant(createDb(meterD1(env.DB, tally)), seed.org.id);
  const cost = async (work: () => Promise<unknown>) => {
    Object.assign(tally, emptyTally());
    await work();
    return { ...tally };
  };
  return { seed, at: { notebookId: seed.notebook.id, userId: student.id }, tenant, cost };
}

describe('the database meter', () => {
  it('counts a save, and a later save of the same cell writes one row', async () => {
    const { at, tenant, cost } = await metered();
    expect(await cost(() => tenant.codeEdits.save({ ...at, cell: 1, code: 'x = 1' }))).toEqual({
      queries: 1,
      read: 0,
      written: 3,
    });
    expect(await cost(() => tenant.codeEdits.save({ ...at, cell: 1, code: 'x = 2' }))).toEqual({
      queries: 1,
      read: 1,
      written: 1,
    });
    await tenant.traceAnswers.save({ ...at, cell: 3, rows: [{ edge: 'A-C' }] });
    expect(await cost(() => tenant.traceAnswers.save({ ...at, cell: 3, rows: [{ edge: 'A-B' }] }))).toEqual({
      queries: 1,
      read: 1,
      written: 1,
    });
  });

  it("saves a student's work in one statement per table (#177)", async () => {
    const { at, tenant, cost } = await metered();
    const work = {
      ...at,
      code: [1, 2, 3].map((cell) => ({ cell, code: `x = ${cell}` })),
      traces: [{ cell: 9, rows: [{ edge: 'A-C' }] }],
    };
    await tenant.codeEdits.saveWork(work);
    // Again, changed: updates only, one row written per cell.
    expect(
      await cost(() => tenant.codeEdits.saveWork({ ...work, code: work.code.map((c) => ({ ...c, code: 'y' })) })),
    ).toMatchObject({
      queries: 2,
      written: 4,
    });
  });

  it('counts single rows read through raw(), and every statement of a batch', async () => {
    const { seed, at, tenant, cost } = await metered();
    await tenant.codeEdits.save({ ...at, cell: 1, code: 'x = 1' });
    const read = await cost(() => tenant.codeEdits.ofUser(at.notebookId, at.userId));
    expect(read).toMatchObject({ queries: 1, written: 0 });
    expect(read.read).toBeGreaterThan(0);
    // forReport is one batch of three statements.
    const batch = await cost(() => tenant.submissions.forReport(at.notebookId, [seed.group.id]));
    expect(batch.queries).toBe(3);
  });

  it("reads a user's memberships without scanning the organization (#182)", async () => {
    const { seed, at } = await metered();
    for (let i = 0; i < 30; i++) {
      const other = await seed.tenant.users.create(
        { username: `s${i}`, fullName: `S ${i}`, passwordHash: 'x' },
        'student',
      );
      await seed.tenant.memberships.create({ userId: other.id, role: 'student', groupId: seed.group.id });
    }
    await seed.tenant.memberships.create({ userId: at.userId, role: 'student', groupId: seed.group.id });
    const tally = emptyTally();
    expect(await grantsOf(createDb(meterD1(env.DB, tally)), seed.org.id, at.userId)).toHaveLength(2);
    // Its own two rows and their roles, whatever the size of the class.
    expect(tally.read).toBeLessThanOrEqual(8);
  });
});

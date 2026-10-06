import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createDb } from '../../src/api/db';
import { organizations } from '../../src/api/db/schema';

describe('database', () => {
  it('applies the migrations inside workerd', async () => {
    const { results } = await env.DB.prepare('select name from d1_migrations order by id').all<{ name: string }>();
    expect(results.map((r) => r.name)).toContain('0000_organizations.sql');
  });

  it('stores and reads an organization through Drizzle', async () => {
    const db = createDb(env.DB);
    await db.insert(organizations).values({ id: crypto.randomUUID(), name: 'FSHN', slug: 'fshn' });

    const [org] = await db.select().from(organizations).where(eq(organizations.slug, 'fshn'));
    expect(org?.name).toBe('FSHN');
    expect(org?.createdAt).toBeInstanceOf(Date);
  });

  it('rejects a duplicate organization slug', async () => {
    const db = createDb(env.DB);
    await db.insert(organizations).values({ id: crypto.randomUUID(), name: 'One', slug: 'same' });
    await expect(
      db.insert(organizations).values({ id: crypto.randomUUID(), name: 'Two', slug: 'same' }),
    ).rejects.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { uuidv7 } from '../../src/api/db/ids';

describe('uuidv7', () => {
  it('is a version 7, variant 10 UUID', () => {
    expect(uuidv7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('starts with the creation time in milliseconds', () => {
    const now = Date.UTC(2026, 9, 7, 12, 0, 0, 123);
    const id = uuidv7(now);
    expect(Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16)).toBe(now);
  });

  it('sorts by creation time and does not repeat', () => {
    const ids = [uuidv7(1_000), uuidv7(2_000), uuidv7(3_000)];
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(Array.from({ length: 1000 }, () => uuidv7())).size).toBe(1000);
  });
});

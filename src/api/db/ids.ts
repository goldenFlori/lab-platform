import { type SQL, sql } from 'drizzle-orm';

/**
 * A UUIDv7 (RFC 9562): 48 bits of Unix milliseconds followed by random bits.
 * Ids sort by creation time, which keeps indexes compact, and stay unguessable.
 */
export function uuidv7(now = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  for (let i = 0; i < 6; i++) {
    bytes[i] = Math.floor(now / 2 ** (8 * (5 - i))) % 256;
  }
  bytes[6] = 0x70 | (bytes[6] & 0x0f); // version 7
  bytes[8] = 0x80 | (bytes[8] & 0x3f); // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A UUIDv7 made by SQL, a new one for each row an INSERT … SELECT writes: this moment's milliseconds,
 * then random bits with the version and variant.
 */
export function sqlUuidv7(now = Date.now()): SQL {
  const prefix = uuidv7(now).slice(0, 14);
  return sql`lower(${prefix} || '7' || substr(hex(randomblob(2)), 2) || '-'
    || substr('89AB', 1 + abs(random() % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))`;
}

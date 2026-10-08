// Password hashing with PBKDF2-SHA256 through WebCrypto, so it runs in Workers and in Node.
// No imports: the API, the app (which hashes generated passwords in the browser) and
// scripts/create-account.ts all use this file directly.
//
// Stored format: pbkdf2-sha256$<iterations>$<salt, base64>$<hash, base64>. The parameters travel
// with each hash, so raising the iteration count later upgrades every account at its next login.
//
// Cost: the free plan allows 10 ms of CPU per request. Measured in production (2026-10-08): a
// warm login takes 5-7 ms of CPU at 15,000 iterations (8-11 ms at 40,000), most of it the rest
// of the request rather than the hash. Strength comes mostly from the passwords themselves:
// pedagog-issued passwords are 12+ random characters, far beyond any offline guessing.

const ALGORITHM = 'pbkdf2-sha256';
export const PASSWORD_ITERATIONS = 15_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

/** Verifying against this costs the same as a real check, so unknown usernames take as long as wrong passwords. */
const DECOY_HASH = `${ALGORITHM}$${PASSWORD_ITERATIONS}$${'A'.repeat(22)}==$${'A'.repeat(43)}=`;

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  // NFC: "ë" typed as one character or as "e" plus a combining mark is the same password.
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function parse(stored: string) {
  const [algorithm, iterations, salt, hash, ...rest] = stored.split('$');
  if (algorithm !== ALGORITHM || !iterations || !salt || !hash || rest.length > 0) return undefined;
  try {
    return { iterations: Number(iterations), salt: fromBase64(salt), hash: fromBase64(hash) };
  } catch {
    return undefined; // not base64
  }
}

/** Compares in constant time, so the response time reveals nothing about the hash. */
function equal(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return `${ALGORITHM}$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

/** Checks a password against a stored hash; pass `null` for a missing account to spend the same time. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parsed = parse(stored ?? DECOY_HASH) ?? parse(DECOY_HASH);
  if (!parsed) return false;
  const actual = await derive(password, parsed.salt, parsed.iterations);
  return stored !== null && equal(actual, parsed.hash);
}

/** True when the hash was made with other parameters than today's, and should be replaced. */
export function needsRehash(stored: string) {
  return parse(stored)?.iterations !== PASSWORD_ITERATIONS;
}

/**
 * A hash the server may store when it comes from elsewhere (the pedagog's browser): today's
 * algorithm, at least today's cost, and a salt and hash of the right size.
 */
export function isValidPasswordHash(stored: string) {
  const parsed = parse(stored);
  return (
    parsed !== undefined &&
    Number.isInteger(parsed.iterations) &&
    parsed.iterations >= PASSWORD_ITERATIONS &&
    parsed.iterations <= 100_000 &&
    parsed.salt.length === SALT_BYTES &&
    parsed.hash.length === HASH_BYTES
  );
}

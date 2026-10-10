// A converter result in a form small enough to keep as a fixture: long strings (rendered HTML and
// code) become fingerprints, and assets become their names and sizes. Shared by the snapshot
// script (scripts/snapshot-course-notebooks.ts) and the tests, so both compare the same thing.
// No imports: Node runs this directly.

const FINGERPRINTED = new Set(['html', 'raw']);

async function fingerprint(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return `sha256:${Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

async function walk(value: unknown, key = ''): Promise<unknown> {
  if (typeof value === 'string') return FINGERPRINTED.has(key) ? fingerprint(value) : value;
  if (Array.isArray(value)) return Promise.all(value.map((item) => walk(item)));
  if (value && typeof value === 'object') {
    const entries = await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await walk(v, k)] as const));
    return Object.fromEntries(entries);
  }
  return value;
}

type Result = { assets: Map<string, { length: number }> } & Record<string, unknown>;

export async function normalize(result: Result) {
  const { assets, ...rest } = result;
  return {
    ...((await walk(rest)) as Record<string, unknown>),
    assets: [...assets.entries()]
      .map(([file, bytes]) => ({ file, bytes: bytes.length }))
      .sort((a, b) => a.file.localeCompare(b.file)),
  };
}

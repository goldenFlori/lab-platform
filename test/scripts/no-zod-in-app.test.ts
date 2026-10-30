import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The app imports only types from src/shared's schema files, so Zod stays out of its bundle (CLAUDE.md).
// A single value import broke that once (#193: 87 KB of Zod on every lab page). This follows every
// value import of src/web and src/viz into src/shared, transitively, and finds any that reaches Zod.

const ROOTS = ['src/web', 'src/viz'];
const VALUE_IMPORT = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

/** A relative import resolved to its file, or null for a package. */
function resolveImport(from: string, spec: string) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec).replace(/\.tsx?$/, '');
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Value imports in a file: every import except `import type …` (and named imports all marked type). */
function valueImports(file: string) {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(VALUE_IMPORT)]
    .filter((m) => !/^\s*(?:import|export)\s*\{\s*(?:type\s+\w+\s*,?\s*)+\}/.test(m[0]))
    .map((m) => m[1] as string);
}

/** The chain of shared files through which `file` reaches Zod, or null. */
function zodChain(file: string, seen = new Set<string>()): string[] | null {
  if (seen.has(file)) return null;
  seen.add(file);
  for (const spec of valueImports(file)) {
    if (spec === 'zod') return [file];
    const next = resolveImport(file, spec);
    if (!next?.includes(`${resolve('src/shared')}/`)) continue;
    const chain = zodChain(next, seen);
    if (chain) return [file, ...chain];
  }
  return null;
}

describe('the app bundle', () => {
  it('reaches no Zod through a value import of src/shared', () => {
    const found = ROOTS.flatMap(files).flatMap((file) => {
      const chains = valueImports(file)
        .map((spec) => resolveImport(file, spec))
        .filter((f): f is string => !!f?.includes(`${resolve('src/shared')}/`))
        .map((shared) => zodChain(shared))
        .filter((c): c is string[] => !!c);
      return chains.map((c) => [file, ...c].map((f) => f.replace(`${resolve('.')}/`, '')).join(' → '));
    });
    expect(found).toEqual([]);
  });
});

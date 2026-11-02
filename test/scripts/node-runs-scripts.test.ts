import { readdirSync, readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The scripts run in Node as they are, with their types stripped and nothing compiled. TypeScript that
// needs compiling (parameter properties, enums, namespaces) passes the type check and the tests, which
// compile, and fails only when the owner runs the script: `npm run course:import` did so after #209.
// So every script, and the src/ files they import, must strip as Node strips them.

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : path.endsWith('.ts') && !path.endsWith('.d.ts') ? [path] : [];
  });

describe('the scripts run in Node as they are', () => {
  it.each([...files('scripts'), ...files('src/notebook'), ...files('src/shared')])('%s needs no compiling', (file) => {
    expect(() => stripTypeScriptTypes(readFileSync(file, 'utf8'), { mode: 'strip' })).not.toThrow();
  });

  it('would catch a parameter property', () => {
    expect(() => stripTypeScriptTypes('class A { constructor(readonly x: number) {} }', { mode: 'strip' })).toThrow();
  });
});

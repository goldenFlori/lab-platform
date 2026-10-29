import { describe, expect, it } from 'vitest';
import { partOf, roomSeconds, wireBytes } from '../../scripts/measure-room';

// #190: what a lab room downloads, sorted by part and sized as production sends it.

describe('npm run measure:room', () => {
  it('sorts each download by what it is', () => {
    expect(partOf('http://localhost:4195/assets/index-1a2b.js')).toBe('app code');
    expect(partOf('http://localhost:4195/o/measure/courses/1/labs/2')).toBe('app code');
    expect(partOf('http://localhost:4195/assets/inter-latin.woff2')).toBe('fonts');
    expect(partOf('http://localhost:4195/pyodide/0.29.0/pyodide.asm.wasm')).toBe('Python engine');
    expect(
      partOf('https://cdn.jsdelivr.net/pyodide/v0.29.0/full/numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl'),
    ).toBe('Python packages');
    expect(partOf('https://files.pythonhosted.org/packages/plotly-6.0.0-py3-none-any.whl')).toBe('Python packages');
    expect(partOf('http://localhost:4195/api/orgs/measure/courses')).toBe('lab data (API)');
  });

  it('counts what Cloudflare compresses as compressed, and archives as they are', () => {
    const text = Buffer.from('a'.repeat(100_000));
    expect(wireBytes(text, 'application/wasm', false)).toBeLessThan(1000);
    expect(wireBytes(text, 'application/zip', false)).toBe(100_000);
    expect(wireBytes(text, 'application/json', true)).toBe(100_000);
  });

  it('turns a room into minutes', () => {
    // 120 devices × 31 MB over 100 Mbit/s: about five minutes.
    expect(Math.round(roomSeconds(31e6, 120, 100))).toBe(298);
  });
});

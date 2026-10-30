import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { help as en } from '../../src/web/i18n/help.en';
import { SHOTS, help as sq } from '../../src/web/i18n/help.sq';

// #194: the guides say the same in both languages, and every picture they name was taken for both
// (npm run help:screenshots).

describe('the guides', () => {
  it('match between Albanian and English: the same guides, steps and pictures, in order', () => {
    const shape = (guides: typeof sq.guides) =>
      guides.map((g) => ({ id: g.id, audience: g.audience, shots: g.steps.map((s) => s.shot ?? null) }));
    expect(shape(en.guides)).toEqual(shape(sq.guides));
  });

  it('use every picture, and every picture exists in both languages', () => {
    const used = new Set(sq.guides.flatMap((g) => g.steps.flatMap((s) => (s.shot ? [s.shot] : []))));
    expect([...used].sort()).toEqual([...SHOTS].sort());
    for (const locale of ['sq', 'en']) {
      for (const shot of SHOTS) expect(existsSync(`public/help/${locale}/${shot}.jpg`), `${locale}/${shot}`).toBe(true);
    }
  });

  it('close every bold mark they open', () => {
    for (const g of [...sq.guides, ...en.guides]) {
      for (const step of g.steps) expect((step.text.match(/\*\*/g) ?? []).length % 2, `${g.id}: ${step.text}`).toBe(0);
    }
  });
});

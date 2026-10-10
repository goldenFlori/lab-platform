import { describe, expect, it } from 'vitest';
import { renderNotebook } from '../../src/notebook';
import { normalize } from './normalize';

// The course notebooks must come out exactly as the course site's converter made them: every cell,
// heading, anchor, output and asset (rendered HTML compared by fingerprint).
const notebooks = import.meta.glob<string>('./fixtures/notebooks/*.ipynb', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const expected = import.meta.glob<Record<string, unknown>>('./fixtures/expected/*.json', {
  import: 'default',
  eager: true,
});

const name = (path: string) => (path.split('/').pop() as string).replace(/\.(ipynb|json)$/, '');
const expectedByName = new Map(Object.entries(expected).map(([path, value]) => [name(path), value]));

describe('the converter on the course notebooks', () => {
  it('has a snapshot for every fixture notebook', () => {
    expect(Object.keys(notebooks).map(name).sort()).toEqual([...expectedByName.keys()].sort());
    expect(Object.keys(notebooks).length).toBe(19);
  });

  it.each(Object.keys(notebooks).map(name))('%s gives the same cells as the course site', async (notebook) => {
    const raw = notebooks[`./fixtures/notebooks/${notebook}.ipynb`] as string;
    expect(await normalize(await renderNotebook(raw))).toEqual(expectedByName.get(notebook));
  });
});

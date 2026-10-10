import { describe, expect, it } from 'vitest';
import { planCourse, type SiteCourse } from '../../scripts/course-import/plan';
import site from './fixtures/course.json';
import embeds from './fixtures/embeds.json';

// The course import's plan (#16), on the course site's own labs and notebooks.

const notebooks = import.meta.glob<string>('./fixtures/notebooks/*.ipynb', {
  query: '?raw',
  import: 'default',
  eager: true,
});
function notebook(file: string) {
  const raw = notebooks[`./fixtures/notebooks/${file}`];
  if (raw === undefined) throw new Error(`No fixture notebook ${file}`);
  return raw;
}
const course = site as Omit<SiteCourse, 'embeds'>;
const only = (...labs: number[]): SiteCourse => ({
  ...course,
  labs: course.labs.filter((lab) => labs.includes(lab.n)),
  homework: course.homework.filter((hw) => labs.includes(hw.lab)),
  embeds: embeds as SiteCourse['embeds'],
});

describe('planning the course import', () => {
  it('gives labs 5 and 6 each their own part of the notebook they share on the site', async () => {
    const [lab5, lab6] = await planCourse({ site: only(5, 6), notebook, solutions: new Map() });
    const [part5, part6] = [lab5?.notebooks[0], lab6?.notebooks[0]];
    const anchors = (part: typeof part5) =>
      part?.stored.cells.flatMap((cell) => (cell.type === 'markdown' && cell.id ? [cell.id] : [])) ?? [];

    expect(part5).toMatchObject({
      kind: 'main',
      title: 'Materiali kryesor',
      originalName: 'laborator-05-laboratori-5.ipynb',
    });
    expect(anchors(part5)).toContain('ushtrimi-3-pema-perfshirese-minimum-kruskal-dhe-prim');
    expect(anchors(part5)).toContain('pune-ne-klase');
    expect(anchors(part5)).not.toContain('ushtrimi-4-komponentet-e-lidhura-fort');
    expect(anchors(part6)[0]).toBe('ushtrimi-4-komponentet-e-lidhura-fort');
    expect(anchors(part6)).not.toContain('pune-ne-klase');

    // Each part is a notebook of whole cells, and its visualizations follow their cells.
    const whole = JSON.parse(notebook('laborator-05.ipynb')).cells;
    const [opening, ...rest] = JSON.parse(part6?.raw ?? '').cells;
    expect(rest).toEqual(whole.slice(11, 19));
    // It starts at its heading, as on the site, without the rule above it.
    expect(opening).toEqual({ ...whole[10], source: whole[10].source.slice(2) });
    expect(JSON.parse(part5?.raw ?? '').cells).toEqual([...whole.slice(0, 10), ...whole.slice(19)]);
    expect(part5?.embeds.map((e) => [e.cell, e.viz])).toEqual([
      [3, 'labirinti'],
      [6, 'grafet'],
      [9, 'grafet'],
    ]);
    expect(part6?.embeds.map((e) => e.cell)).toEqual([2, 5, 8]);
    expect(lab6?.notebooks[1]).toMatchObject({
      kind: 'extra',
      title: 'Detyrë shtëpie — Komponentet e Lidhura Fort & Renditjet Topologjike',
    });
  });

  it('adds a solution after the notebooks, only where it solves one of them', async () => {
    const solved = notebook('laborator-10.ipynb');
    const [lab10] = await planCourse({
      site: only(10),
      notebook,
      solutions: new Map([['laborator-10-ZGJIDHJE.ipynb', solved]]),
    });
    expect(lab10?.notebooks.map((nb) => [nb.kind, nb.title])).toEqual([
      ['main', 'Materiali kryesor'],
      ['solution', 'Materiali kryesor'],
    ]);
    expect(lab10?.notebooks[1]?.embeds).toEqual(lab10?.notebooks[0]?.embeds);

    const other = notebook('laborator-09.ipynb');
    await expect(
      planCourse({ site: only(10), notebook, solutions: new Map([['laborator-10-ZGJIDHJE.ipynb', other]]) }),
    ).rejects.toThrow('its cells differ from laborator-10.ipynb');
    await expect(
      planCourse({ site: only(10), notebook, solutions: new Map([['laborator-03-ZGJIDHJE.ipynb', solved]]) }),
    ).rejects.toThrow('no notebook of the course that it solves');
  });
});

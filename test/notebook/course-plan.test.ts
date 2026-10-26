import { describe, expect, it } from 'vitest';
import { planCourse, type SiteCourse } from '../../scripts/course-import/plan';
import site from './fixtures/course.json';
import embeds from './fixtures/embeds.json';
import platformEmbeds from './fixtures/platform-embeds.json';

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
  // #160: the platform's own visualizations, listed apart from the site's, land in the right lab's part.
  it("places the platform's own visualizations beside the site's", async () => {
    const platformEmbeds = {
      'laborator-05.ipynb': [
        { cell: 15, viz: 'tabela-gjurmimit', title: 'Kruskal me dorë', props: { preset: 'lab05-kruskal' } },
        { cell: 16, viz: 'tabela-gjurmimit', props: { preset: 'lab05-prim' } },
        { cell: 9, viz: 'tabela-gjurmimit', props: { preset: 'lab06-kahn' } },
      ],
    };
    const [lab5, lab6] = await planCourse({ site: { ...only(5, 6), platformEmbeds }, notebook, solutions: new Map() });
    // Lab 5's part keeps cells 0–6 and 13 on, so the class problems 15 and 16 become 9 and 10.
    const part5 = lab5?.notebooks[0]?.embeds ?? [];
    expect(part5.map((e) => [e.cell, e.viz])).toEqual([
      [2, 'labirinti'],
      [4, 'grafet'],
      [6, 'grafet'],
      [9, 'tabela-gjurmimit'],
      [10, 'tabela-gjurmimit'],
    ]);
    expect(part5.slice(3).map((e) => [e.title, e.props?.preset])).toEqual([
      ['Kruskal me dorë', 'lab05-kruskal'],
      [null, 'lab05-prim'],
    ]);
    // Lab 6's part starts at cell 7, so the topological sort at 9 becomes 2.
    expect(lab6?.notebooks[0]?.embeds.find((e) => e.viz === 'tabela-gjurmimit')?.cell).toBe(2);
  }, 60_000);

  it("places the course repo's own list of platform visualizations (#161)", async () => {
    const labs = await planCourse({
      site: { ...only(3, 5, 6, 7, 8), platformEmbeds: platformEmbeds as SiteCourse['platformEmbeds'] },
      notebook,
      solutions: new Map(),
    });
    const traces = labs.flatMap((lab) =>
      lab.notebooks.flatMap((nb) =>
        nb.embeds.filter((e) => e.viz === 'tabela-gjurmimit').map((e) => [lab.n, e.props?.preset]),
      ),
    );
    expect(traces).toEqual([
      [5, 'lab05-kruskal'],
      [5, 'lab05-prim'],
      [6, 'lab06-kahn'],
      [7, 'lab07-dijkstra'],
      [7, 'lab07-bellman'],
      [8, 'lab08-floyd'],
    ]);
    const extra = (n: number) => labs.find((lab) => lab.n === n)?.notebooks.find((nb) => nb.kind === 'extra');
    expect(extra(3)?.embeds.map((e) => e.viz)).toContain('pema-rekursive');
    expect(extra(5)?.embeds.map((e) => e.viz)).toEqual(['kruskal-prim']);
    // Converts five labs' notebooks: more than the default 5 s on a busy CI runner.
  }, 60_000);

  it('refuses a visualization the platform does not have, or a cell the site already uses', async () => {
    const plan = (platformEmbeds: SiteCourse['platformEmbeds']) =>
      planCourse({ site: { ...only(5), platformEmbeds }, notebook, solutions: new Map() });
    await expect(plan({ 'laborator-05.ipynb': [{ cell: 15, viz: 'nuk-ekziston' }] })).rejects.toThrow(
      'the platform has no visualization "nuk-ekziston"',
    );
    await expect(plan({ 'laborator-05.ipynb': [{ cell: 2, viz: 'pema-rekursive' }] })).rejects.toThrow(
      'cell 2 has a visualization on the site already',
    );
  });

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
    expect(rest).toEqual(whole.slice(8, 13));
    // It starts at its heading, as on the site, without the rule above it.
    expect(opening).toEqual({ ...whole[7], source: whole[7].source.slice(2) });
    expect(JSON.parse(part5?.raw ?? '').cells).toEqual([...whole.slice(0, 7), ...whole.slice(13)]);
    expect(part5?.embeds.map((e) => [e.cell, e.viz])).toEqual([
      [2, 'labirinti'],
      [4, 'grafet'],
      [6, 'grafet'],
    ]);
    expect(part6?.embeds.map((e) => e.cell)).toEqual([1, 3, 5]);
    // Its extra exercises (#28 in the course repo), then its homework.
    expect(lab6?.notebooks.slice(1).map((nb) => [nb.kind, nb.title])).toEqual([
      ['extra', 'Ushtrime Shtesë — Kahn, DFS dhe Kosaraju në kod'],
      ['extra', 'Detyrë shtëpie — Komponentet e Lidhura Fort & Renditjet Topologjike'],
    ]);
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

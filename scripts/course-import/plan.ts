import type { RenderedNotebook } from '../../src/notebook/index.ts';
import { renderNotebook } from '../../src/notebook/index.ts';
import { isSolutionOf } from '../../src/notebook/slides.ts';
import { type StoredNotebook, toStored } from '../../src/notebook/stored.ts';
import type { Embed, NotebookKind } from '../../src/shared/notebooks.ts';
import { isVisualizerId } from '../../src/shared/visualizers.ts';

// What a course site (the course repo's site/content/course.mjs) becomes on the platform (#16):
// its labs, each with its notebooks converted and its visualizations placed, and the solutions
// next to the notebooks they solve. Nothing here talks to the platform; see apply.ts.

type SiteEmbed = { cell: number; viz: string; title?: string; props?: Record<string, unknown> };

/** A slice of a notebook by heading anchors: from one heading up to (not including) the next. */
type SiteRange = [string | null, string | null];

export type SiteCourse = {
  title: string;
  labs: {
    n: number;
    week?: number;
    title: string;
    status: string;
    summary?: string;
    resources?: { type: string; title: string; notebook?: string; sections?: { ranges: SiteRange[] } }[];
  }[];
  homework: { lab: number; title: string; status: string; notebook: string }[];
  embeds: Record<string, SiteEmbed[]>;
  /**
   * Visualizations only the platform has (#160), such as the trace tables: the course repo lists them
   * in site/content/platform.mjs, which the site never reads, by notebook and cell like `embeds`.
   */
  platformEmbeds?: Record<string, SiteEmbed[]>;
};

export type CourseSource = {
  site: SiteCourse;
  /** A notebook of the site, by file name. */
  notebook: (file: string) => string;
  /** Solved notebooks by file name: `<notebook>-ZGJIDHJE.ipynb` solves `<notebook>.ipynb`. */
  solutions: Map<string, string>;
};

export type PlannedNotebook = {
  kind: NotebookKind;
  title: string;
  /** What the pedagog downloads, and how a later import recognizes the notebook. */
  originalName: string;
  raw: string;
  stored: StoredNotebook;
  assets: Map<string, Uint8Array>;
  embeds: Embed[];
};

export type PlannedLab = {
  n: number;
  title: string;
  week: number | null;
  summary: string | null;
  notebooks: PlannedNotebook[];
};

/** Statuses whose content the site publishes; drafts and "coming soon" labs come without notebooks. */
const PUBLISHED = new Set(['published', 'updated']);
const SOLVED = /-ZGJIDHJE\.ipynb$/;

async function convert(raw: string) {
  const assets = new Map<string, Uint8Array>();
  return { stored: toStored(await renderNotebook(raw, { assets })), assets };
}

const embedsOf = (list: SiteEmbed[] | undefined): Embed[] =>
  (list ?? [])
    .map((e) => ({ cell: e.cell, viz: e.viz, title: e.title ?? null, props: e.props ?? null }))
    .sort((a, b) => a.cell - b.cell);

/**
 * A notebook's embeds: the site's, and the platform's own beside them. A cell takes one visualization,
 * and only one the platform knows, so a clash or an unknown id stops the import before it starts.
 */
function embedsFor(site: SiteCourse, file: string): Embed[] {
  const own = site.platformEmbeds?.[file] ?? [];
  for (const e of own) {
    if (!isVisualizerId(e.viz))
      throw new Error(`${file}: the platform has no visualization "${e.viz}" (cell ${e.cell})`);
  }
  const taken = new Set((site.embeds[file] ?? []).map((e) => e.cell));
  for (const e of own) {
    if (taken.has(e.cell)) throw new Error(`${file}: cell ${e.cell} has a visualization on the site already`);
    taken.add(e.cell);
  }
  return embedsOf([...(site.embeds[file] ?? []), ...own]);
}

/**
 * The cells of `ranges`, as a notebook of its own. A range starts at a heading's anchor, which must
 * open its cell in the .ipynb (after at most a rule), so that the part is made of whole cells and
 * stays a valid notebook.
 */
function slice(file: string, raw: string, rendered: RenderedNotebook, ranges: SiteRange[]) {
  const start = (anchor: string) => {
    const at = rendered.cells.findIndex((cell) => cell.type === 'markdown' && cell.id === anchor);
    const cell = rendered.cells[at];
    if (!cell) throw new Error(`${file}: no heading with the anchor "${anchor}"`);
    const opensItsCell = rendered.cells
      .slice(0, at)
      .filter((c) => c.srcIndex === cell.srcIndex)
      .every((c) => c.type === 'markdown' && !c.heading && !c.html.replace(/<hr\s*\/?>/g, '').trim());
    if (!opensItsCell) throw new Error(`${file}: the heading "${anchor}" does not start its cell`);
    return cell.srcIndex;
  };
  const notebook = JSON.parse(raw) as { cells: { source?: string | string[] }[] };
  const kept: number[] = [];
  for (const [from, to] of ranges) {
    const end = to ? start(to) : notebook.cells.length;
    for (let i = from ? start(from) : 0; i < end; i++) kept.push(i);
  }
  const cells = kept.map((i) => notebook.cells[i]);
  // Like the site, the part starts at its heading: a rule above it would open the page.
  const first = cells[0];
  if (first && ranges[0]?.[0]) {
    const source = [first.source ?? ''].flat().join('');
    const lines = source.replace(LEADING_RULE, '').split(/(?<=\n)/);
    cells[0] = { ...first, source: Array.isArray(first.source) ? lines : lines.join('') };
  }
  // Jupyter's own layout, one space per level.
  return { raw: `${JSON.stringify({ ...notebook, cells }, null, 1)}\n`, kept };
}

/** A Markdown rule (---, *** or ___) on the first line, with the blank lines after it. */
const LEADING_RULE = /^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*\n(?:[ \t]*\n)*/;

export async function planCourse({ site, notebook, solutions }: CourseSource): Promise<PlannedLab[]> {
  const labs: PlannedLab[] = [];
  for (const lab of site.labs) {
    const notebooks: PlannedNotebook[] = [];
    const published = PUBLISHED.has(lab.status);
    for (const resource of published ? (lab.resources ?? []) : []) {
      if (!resource.notebook) continue;
      const file = resource.notebook;
      let raw = notebook(file);
      let embeds = embedsFor(site, file);
      let originalName = file;
      if (resource.sections) {
        // Labs 5 and 6 share one notebook on the site; here each lab gets its own part of it.
        const whole = await renderNotebook(raw, { assets: new Map() });
        const part = slice(file, raw, whole, resource.sections.ranges);
        const at = new Map(part.kept.map((cell, i) => [cell, i]));
        raw = part.raw;
        embeds = embeds.flatMap((e) => (at.has(e.cell) ? [{ ...e, cell: at.get(e.cell) as number }] : []));
        originalName = file.replace(/\.ipynb$/, `-laboratori-${lab.n}.ipynb`);
      }
      notebooks.push({
        kind: resource.type === 'main' ? 'main' : 'extra',
        // "Laboratori 1 — Materiali kryesor" reads "Materiali kryesor" on Laboratori 1's own page.
        title: resource.title.replace(/^Laboratori \d+\s*—\s*/, ''),
        originalName,
        raw,
        ...(await convert(raw)),
        embeds,
      });
    }
    for (const homework of site.homework) {
      if (homework.lab !== lab.n || !PUBLISHED.has(homework.status)) continue;
      const raw = notebook(homework.notebook);
      notebooks.push({
        kind: 'extra',
        title: `Detyrë shtëpie — ${homework.title}`,
        originalName: homework.notebook,
        raw,
        ...(await convert(raw)),
        embeds: embedsFor(site, homework.notebook),
      });
    }
    labs.push({ n: lab.n, title: lab.title, week: lab.week ?? null, summary: lab.summary ?? null, notebooks });
  }

  // Each solution goes after the lab's notebooks, and only if it really is the solved version of
  // one of them: the presenter swaps in its code cell by cell.
  for (const [file, raw] of [...solutions].sort(([a], [b]) => a.localeCompare(b))) {
    const solves = file.replace(SOLVED, '.ipynb');
    const lab = labs.find((l) => l.notebooks.some((nb) => nb.originalName === solves));
    const target = lab?.notebooks.find((nb) => nb.originalName === solves);
    if (!SOLVED.test(file) || !lab || !target) throw new Error(`${file}: no notebook of the course that it solves`);
    const converted = await convert(raw);
    if (!isSolutionOf(converted.stored, target.stored)) {
      throw new Error(`${file}: its cells differ from ${solves}, so it cannot be shown as its solution`);
    }
    lab.notebooks.push({
      kind: 'solution',
      // The app labels it "Zgjidhja · Ushtrime Shtesë", so the exercise's subtitle is left out.
      title: target.title.split(' — ')[0] ?? target.title,
      originalName: file,
      raw,
      ...converted,
      embeds: target.embeds,
    });
  }
  return labs;
}

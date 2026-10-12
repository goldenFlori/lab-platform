import { VARIANT_SECTIONS } from '../../shared/ai-sections';
import { type CheckResult, cellFile } from '../python/runner';
import { PythonSession } from '../python/session';

// An exercise variant from the copilot (#85): read from its headings, checked in the pedagog's
// browser, and saved as a notebook of its own with a matching solution notebook.

export type Variant = { title: string; statement: string; starter: string; solution: string; tests: string };

type Section = (typeof VARIANT_SECTIONS)[number];

const HEADING = new RegExp(`^#{1,4}\\s*(${VARIANT_SECTIONS.join('|')})\\s*:?\\s*$`, 'gm');

/** The headings written so far, for showing progress while the copilot writes. */
export const sectionsWritten = (text: string) => new Set([...text.matchAll(HEADING)].map((m) => m[1])).size;

/** Code without the markdown fence the model often puts around it. */
const unfenced = (text: string) => (text.match(/```[\w-]*\n([\s\S]*?)```/)?.[1] ?? text).trim();

/** The variant, or null when a section is missing or empty. */
export function parseVariant(text: string): Variant | null {
  const marks = [...text.matchAll(HEADING)];
  const parts = new Map<Section, string>();
  marks.forEach((mark, i) => {
    const start = (mark.index ?? 0) + mark[0].length;
    parts.set(mark[1] as Section, text.slice(start, marks[i + 1]?.index ?? text.length).trim());
  });
  const variant = {
    title: (parts.get('TITLE') ?? '').split('\n')[0]?.replace(/[*#`]/g, '').trim() ?? '',
    statement: parts.get('TASK') ?? '',
    starter: unfenced(parts.get('STARTER') ?? ''),
    solution: unfenced(parts.get('SOLUTION') ?? ''),
    tests: unfenced(parts.get('TESTS') ?? ''),
  };
  return Object.values(variant).every(Boolean) ? { ...variant, title: variant.title.slice(0, 160) } : null;
}

/** The code cell that holds the exercise in a variant's notebook (its index in the .ipynb). */
export const VARIANT_CELL = 1;

const lines = (text: string) => text.split(/(?<=\n)/);

function ipynb(markdown: string, code: string) {
  return JSON.stringify({
    cells: [
      { cell_type: 'markdown', metadata: {}, source: lines(markdown) },
      { cell_type: 'code', execution_count: null, metadata: {}, outputs: [], source: lines(code) },
    ],
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      language_info: { name: 'python' },
    },
    nbformat: 4,
    nbformat_minor: 5,
  });
}

/**
 * The exercise notebook (the statement and the starter code) and its solution notebook (the same
 * statement and the solved code). Their text cells are the same, so the presenter pairs them.
 */
export function variantNotebooks(variant: Variant) {
  const markdown = `# ${variant.title}\n\n${variant.statement}`;
  const name = `${
    variant.title
      .normalize('NFD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 60) || 'varianti'
  }.ipynb`;
  const file = (code: string, prefix: string) =>
    new File([ipynb(markdown, code)], `${prefix}${name}`, { type: 'application/x-ipynb+json' });
  return { exercise: file(variant.starter, ''), solution: file(variant.solution, 'zgjidhja-') };
}

export type VariantCheck = { solution: CheckResult; starter: CheckResult };

/** Runs the tests against the starter code, then against the solution, in a fresh Python. */
export async function checkVariant(variant: Variant): Promise<VariantCheck> {
  const session = new PythonSession({ input: false, runLimitMs: 15_000 });
  const check = async (code: string): Promise<CheckResult> => {
    const run = await session.run(`variant-${Math.random()}`, code, cellFile(VARIANT_CELL), { test: variant.tests });
    const outcome = run.outcome;
    if (outcome?.kind === 'ok') return outcome.check ?? { status: 'error', message: '' };
    if (outcome?.kind === 'error') {
      return { status: 'error', message: outcome.traceback.trim().split('\n').at(-1) ?? '' };
    }
    return { status: 'error', message: '' };
  };
  try {
    // The starter first: the solution then replaces what it defined.
    const starter = await check(variant.starter);
    const solution = await check(variant.solution);
    return { solution, starter };
  } finally {
    session.dispose();
  }
}

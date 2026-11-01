// A notebook with someone's own code in it (#214): the original .ipynb, with the given code in place of
// those cells' source. Their saved outputs belong to the original code, so they go, as does the
// execution count. Everything else (text, other cells, metadata) stays as it was. No imports, so the
// app and the API can use it.

type Cell = { cell_type?: string; source?: string | string[]; outputs?: unknown[]; execution_count?: number | null };

/** The .ipynb `raw` with `code` (by the cell's place in it) in place of those code cells' source. */
export function withCode(raw: string, code: ReadonlyMap<number, string>): string {
  const nb = JSON.parse(raw) as { cells?: Cell[] };
  for (const [index, text] of code) {
    const cell = nb.cells?.[index];
    if (cell?.cell_type !== 'code') continue;
    // Jupyter keeps source as lines, each with its newline but the last.
    cell.source = text.split(/(?<=\n)/);
    cell.outputs = [];
    cell.execution_count = null;
  }
  return `${JSON.stringify(nb, null, 1)}\n`;
}

/** "laborator-01.ipynb" and a label → "laborator-01 (label).ipynb". */
export const ipynbNamed = (originalName: string, label: string) =>
  `${originalName.replace(/\.ipynb$/i, '')} (${label.replace(/[\\/:*?"<>|]/g, '')}).ipynb`;

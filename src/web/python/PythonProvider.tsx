import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { StoredNotebook } from '../../notebook/stored';
import type { Cell, CodeCell } from '../../notebook/types';
import { cellFile, type RunCheck } from './runner';
import { type CellRun, PythonSession, type SessionState } from './session';

// Running a notebook's code on the lab page (#47) and in presentations (#50). One Python per
// notebook shown; each code cell finds itself here by identity, so the notebook view needs no extra
// props.

type RunnableCell = { key: string; number: number; filename: string };

export type PythonContextValue = {
  session: PythonSession;
  cells: ReadonlyMap<CodeCell, RunnableCell>;
  /** Runs one cell: the student's own code where they changed it (#49), else the notebook's. */
  run: (cell: CodeCell) => Promise<void>;
  /** Runs the cells above this one, in order, stopping at the first that fails. */
  runAbove: (cell: CodeCell) => Promise<void>;
};

const PythonContext = createContext<PythonContextValue | null>(null);

type PythonOptions = {
  /** The code to run for a cell. */
  codeFor?: (cell: CodeCell) => string;
  /** How a cell's run checks its exercise, when it is one (#51). */
  checkFor?: (cell: CodeCell) => RunCheck | undefined;
  /** Told when a cell has run, and how long it took. */
  onRun?: (cell: CodeCell, run: CellRun, ms: number) => void;
};

export function PythonProvider({
  notebookId,
  notebook,
  children,
  ...options
}: { notebookId: string; notebook: StoredNotebook; children: ReactNode } & PythonOptions) {
  const value = useNotebookPython(notebookId, notebook.cells, options);
  return <PythonScope value={value}>{children}</PythonScope>;
}

/** Shares a notebook's Python with the cells below; for a page that also drives it (presentation). */
export function PythonScope({ value, children }: { value: PythonContextValue; children: ReactNode }) {
  return <PythonContext.Provider value={value}>{children}</PythonContext.Provider>;
}

/** One Python for a notebook's cells: a new notebook gets a new Python, with a fresh namespace. */
export function useNotebookPython(
  notebookId: string,
  notebookCells: readonly Cell[],
  options: PythonOptions = {},
): PythonContextValue {
  // Read when a cell runs, so the latest code and exercises count.
  const latest = useRef(options);
  latest.current = options;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new notebook gets a new Python, with a fresh namespace
  const session = useMemo(() => new PythonSession(), [notebookId]);
  useEffect(() => () => session.dispose(), [session]);

  return useMemo<PythonContextValue>(() => {
    const cells = new Map<CodeCell, RunnableCell>();
    const order: CodeCell[] = [];
    for (const cell of notebookCells) {
      if (cell.type !== 'code') continue;
      order.push(cell);
      // Desktop-window code (pygame, tkinter) cannot run here; its visualization stands in for it.
      if (cell.interactive) continue;
      const number = order.length;
      cells.set(cell, { key: `cell-${number}`, number, filename: cellFile(number - 1) });
    }
    const runOne = async (cell: CodeCell) => {
      const runnable = cells.get(cell);
      if (!runnable) return undefined;
      const { codeFor, checkFor, onRun } = latest.current;
      const started = performance.now();
      const run = await session.run(
        runnable.key,
        codeFor ? codeFor(cell) : cell.raw,
        runnable.filename,
        checkFor?.(cell),
      );
      onRun?.(cell, run, Math.round(performance.now() - started));
      return run;
    };
    return {
      session,
      cells,
      async run(cell) {
        await runOne(cell);
      },
      async runAbove(target) {
        for (const cell of order) {
          if (cell === target) return;
          if (!cells.has(cell)) continue;
          const run = await runOne(cell);
          if (run?.outcome?.kind !== 'ok') return;
        }
      },
    };
  }, [notebookCells, session]);
}

/** The notebook's Python, where code can run here: the lab page and presentations. */
export function usePython() {
  return useContext(PythonContext);
}

const idle: SessionState = { status: 'off', packages: null, failure: null, runs: new Map(), running: null };

export function useSessionState(session: PythonSession | undefined) {
  return useSyncExternalStore(session?.subscribe ?? (() => () => {}), session?.getState ?? (() => idle), () => idle);
}

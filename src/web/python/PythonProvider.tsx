import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { StoredNotebook } from '../../notebook/stored';
import type { CodeCell } from '../../notebook/types';
import { cellFile } from './runner';
import { PythonSession, type SessionState } from './session';

// Running a notebook's code on the lab page (#47). One Python per notebook shown; each code cell
// finds itself here by identity, so the notebook view needs no extra props.

type RunnableCell = { key: string; number: number; filename: string };

type PythonContextValue = {
  session: PythonSession;
  cells: ReadonlyMap<CodeCell, RunnableCell>;
  /** Runs one cell: the student's own code where they changed it (#49), else the notebook's. */
  run: (cell: CodeCell) => Promise<void>;
  /** Runs the cells above this one, in order, stopping at the first that fails. */
  runAbove: (cell: CodeCell) => Promise<void>;
};

const PythonContext = createContext<PythonContextValue | null>(null);

export function PythonProvider({
  notebookId,
  notebook,
  codeFor = (cell) => cell.raw,
  children,
}: {
  notebookId: string;
  notebook: StoredNotebook;
  /** The code to run for a cell. */
  codeFor?: (cell: CodeCell) => string;
  children: ReactNode;
}) {
  const code = useRef(codeFor);
  code.current = codeFor;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new notebook gets a new Python, with a fresh namespace
  const session = useMemo(() => new PythonSession(), [notebookId]);
  useEffect(() => () => session.dispose(), [session]);

  const value = useMemo<PythonContextValue>(() => {
    const cells = new Map<CodeCell, RunnableCell>();
    const order: CodeCell[] = [];
    for (const cell of notebook.cells) {
      if (cell.type !== 'code') continue;
      order.push(cell);
      // Desktop-window code (pygame, tkinter) cannot run here; its visualization stands in for it.
      if (cell.interactive) continue;
      const number = order.length;
      cells.set(cell, { key: `cell-${number}`, number, filename: cellFile(number - 1) });
    }
    const runOne = async (cell: CodeCell) => {
      const runnable = cells.get(cell);
      return runnable ? session.run(runnable.key, code.current(cell), runnable.filename) : undefined;
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
  }, [notebook, session]);

  return <PythonContext.Provider value={value}>{children}</PythonContext.Provider>;
}

/** The notebook's Python, where code can run here (not in presentations yet). */
export function usePython() {
  return useContext(PythonContext);
}

const idle: SessionState = { status: 'off', packages: null, failure: null, runs: new Map(), running: null };

export function useSessionState(session: PythonSession | undefined) {
  return useSyncExternalStore(session?.subscribe ?? (() => () => {}), session?.getState ?? (() => idle), () => idle);
}

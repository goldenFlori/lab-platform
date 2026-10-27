import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CodeCell } from '../../notebook/types';
import { type CodeEdit, MAX_WORK_CELLS, type WorkSaved } from '../../shared/code-edits';
import { api } from './api';
import { type NotebookRef, notebookQuery, notebooksPath } from './notebooks';

// A student's own version of a notebook's code (#49): what they typed shows and runs instead of the
// original, and is saved for them as they type. Code put back exactly as it was is the original
// again, and its saved copy goes.
//
// Saving (#177): code and graded trace rows wait in one queue per notebook and go in one request, a
// few seconds after a change but at most once every SAVE_EVERY_MS, since every request counts against
// the free plan's daily limits. What waits is saved at once when the page is hidden or left, the
// notebook changes, or the student hands in; a failed save keeps its changes and tries again.

export type SaveState = 'saved' | 'pending' | 'saving' | 'failed';

type CodeEditsValue = {
  /** The code to show and run: the user's own, or the original. */
  code: (cell: CodeCell) => string;
  edited: (cell: CodeCell) => boolean;
  change: (cell: CodeCell, code: string) => void;
  reset: (cell: CodeCell) => void;
  resetAll: () => void;
  /** Cells the user has changed. */
  count: number;
  saving: SaveState;
  /** The saved edits are in place (or could not be loaded): runs use the student's code (#78). */
  ready: boolean;
  /** Saves what is still waiting now, trace rows included; false when it could not be saved. */
  flush: () => Promise<boolean>;
  /** A graded trace table's rows (#168), saved with the code. */
  saveTrace: (cell: number, rows: Record<string, string>[]) => void;
  /** Changes when the code changes from outside the editors (loaded, or all put back), which
   * then start again from it. */
  version: number;
};

const CodeEditsContext = createContext<CodeEditsValue | null>(null);

/** A save waits this long after a change, so a burst of typing goes in one. */
const SAVE_AFTER_MS = 3000;
/** And comes at most this often while the student keeps typing. */
const SAVE_EVERY_MS = 30_000;
/** keepalive requests (a page closing) may carry at most 64 KB. */
const KEEPALIVE_BYTES = 60_000;

const editsPath = (ref: NotebookRef) =>
  `${notebooksPath(ref.org, ref.courseId, ref.labId)}/${encodeURIComponent(ref.notebookId)}/edits`;

export const codeEditsQuery = (ref: NotebookRef) => ({
  queryKey: [...notebookQuery(ref).queryKey, 'edits'],
  queryFn: () => api<{ edits: CodeEdit[] }>(editsPath(ref)),
  // This page holds the truth while it is open; the server is only told. Its copy goes when the page
  // closes, so coming back loads what was saved since.
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: 0,
});

export function CodeEditsProvider({
  notebookRef,
  originals,
  children,
}: {
  notebookRef: NotebookRef;
  /** The original code of each code cell, by its cell number. */
  originals: ReadonlyMap<number, string>;
  children: ReactNode;
}) {
  const query = useQuery(codeEditsQuery(notebookRef));
  const [edits, setEdits] = useState<ReadonlyMap<number, string>>(new Map());
  const [saving, setSaving] = useState<SaveState>('saved');
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const pending = useRef(new Map<number, string>());
  const traces = useRef(new Map<number, Record<string, string>[]>());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSave = useRef(0);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const queryClient = useQueryClient();
  const path = editsPath(notebookRef);
  const workPath = `${notebooksPath(notebookRef.org, notebookRef.courseId, notebookRef.labId)}/${encodeURIComponent(notebookRef.notebookId)}/work`;

  // The saved edits, once loaded for this notebook; anything typed before they arrived stays on top.
  useEffect(() => {
    if (!query.data) return;
    const saved = query.data.edits.map((e) => [e.cell, e.code] as const);
    setEdits((typed) => new Map([...saved, ...typed]));
    setVersion((v) => v + 1);
    setLoaded(true);
  }, [query.data]);

  /** One request with up to MAX_WORK_CELLS of what waits; true when it was kept. */
  const send = useCallback(
    async (code: [number, string][], rows: [number, Record<string, string>[]][], keepalive: boolean) => {
      const body = JSON.stringify({
        // The original code again means the saved copy goes.
        code: code.map(([cell, text]) => ({ cell, code: text === originals.get(cell) ? null : text })),
        traces: rows.map(([cell, r]) => ({ cell, rows: r })),
      });
      const res = await fetch(`/api${workPath}`, {
        method: 'PUT',
        credentials: 'same-origin',
        keepalive: keepalive && body.length < KEEPALIVE_BYTES,
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!res.ok) return false;
      // A table whose notebook closed meanwhile cannot be kept: show it as it now is.
      const { refused } = (await res.json()) as WorkSaved;
      for (const cell of refused) {
        void queryClient.invalidateQueries({ queryKey: ['trace-answers', notebookRef.notebookId, cell] });
      }
      return true;
    },
    [originals, workPath, queryClient, notebookRef.notebookId],
  );

  const flush = useCallback(
    async (keepalive = false): Promise<boolean> => {
      clearTimeout(timer.current);
      // One save at a time; a flush during one waits for it (and any that started meanwhile), then
      // saves what came since, so a hand-in never goes ahead of a save still on its way.
      while (inFlight.current) await inFlight.current;
      if (!pending.current.size && !traces.current.size) return true;
      const code = [...pending.current];
      const rows = [...traces.current];
      pending.current.clear();
      traces.current.clear();
      setSaving('saving');
      const run = (async () => {
        try {
          for (let i = 0; i < code.length + rows.length; i += MAX_WORK_CELLS) {
            const part = code.slice(i, i + MAX_WORK_CELLS);
            const left = MAX_WORK_CELLS - part.length;
            const from = Math.max(0, i - code.length);
            const tables = left > 0 ? rows.slice(from, from + left) : [];
            if (!(await send(part, tables, keepalive))) throw new Error('not saved');
          }
          lastSave.current = Date.now();
          return true;
        } catch {
          // Back in the queue, unless typed over since, and tried again later.
          for (const [cell, text] of code) if (!pending.current.has(cell)) pending.current.set(cell, text);
          for (const [cell, r] of rows) if (!traces.current.has(cell)) traces.current.set(cell, r);
          timer.current = setTimeout(() => void flush(), SAVE_EVERY_MS);
          return false;
        }
      })();
      inFlight.current = run;
      const ok = await run;
      inFlight.current = null;
      setSaving(!ok ? 'failed' : pending.current.size || traces.current.size ? 'pending' : 'saved');
      return ok;
    },
    [send],
  );

  /** A change waits: SAVE_AFTER_MS after it, but never sooner than SAVE_EVERY_MS after the last save. */
  const schedule = useCallback(() => {
    setSaving((state) => (state === 'failed' ? state : 'pending'));
    clearTimeout(timer.current);
    const wait = Math.max(SAVE_AFTER_MS, lastSave.current + SAVE_EVERY_MS - Date.now());
    timer.current = setTimeout(() => void flush(), wait);
  }, [flush]);

  // Leaving the page or the notebook saves what is still waiting.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush(true);
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      void flush(true);
    };
  }, [flush]);

  const value = useMemo<CodeEditsValue>(() => {
    const own = (cell: CodeCell) => edits.get(cell.srcIndex);
    return {
      code: (cell) => own(cell) ?? cell.raw,
      edited: (cell) => {
        const code = own(cell);
        return code !== undefined && code !== cell.raw;
      },
      change(cell, code) {
        setEdits((map) => new Map(map).set(cell.srcIndex, code));
        pending.current.set(cell.srcIndex, code);
        schedule();
      },
      saveTrace(cell, rows) {
        traces.current.set(cell, rows);
        schedule();
      },
      reset(cell) {
        pending.current.delete(cell.srcIndex);
        setEdits((map) => {
          const next = new Map(map);
          next.delete(cell.srcIndex);
          return next;
        });
        void api(`${path}/${cell.srcIndex}`, { method: 'DELETE' }).catch(() => setSaving('failed'));
      },
      resetAll() {
        pending.current.clear();
        setEdits(new Map());
        setVersion((v) => v + 1);
        setSaving('saved');
        void api(path, { method: 'DELETE' }).catch(() => setSaving('failed'));
      },
      count: [...edits].filter(([cell, code]) => code !== originals.get(cell)).length,
      saving,
      version,
      ready: loaded || query.isError,
      flush: () => flush(),
    };
  }, [edits, flush, schedule, originals, path, saving, version, loaded, query.isError]);

  return <CodeEditsContext.Provider value={value}>{children}</CodeEditsContext.Provider>;
}

/** The notebook's edits, where code can be edited here (the lab page). */
export function useCodeEdits() {
  return useContext(CodeEditsContext);
}

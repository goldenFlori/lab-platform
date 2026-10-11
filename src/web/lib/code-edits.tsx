import { useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CodeCell } from '../../notebook/types';
import type { CodeEdit } from '../../shared/code-edits';
import { api } from './api';
import { type NotebookRef, notebookQuery, notebooksPath } from './notebooks';

// A student's own version of a notebook's code (#49): what they typed shows and runs instead of the
// original, and is saved for them as they type, a moment after they stop. Code put back exactly as
// it was is the original again, and its saved copy goes.

export type SaveState = 'saved' | 'saving' | 'failed';

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
  /** Saves what is still waiting now; false when it could not be saved. */
  flush: () => Promise<boolean>;
  /** Changes when the code changes from outside the editors (loaded, or all put back), which
   * then start again from it. */
  version: number;
};

const CodeEditsContext = createContext<CodeEditsValue | null>(null);

/** Typing pauses this long before a save. */
const SAVE_AFTER_MS = 800;

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
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const path = editsPath(notebookRef);

  // The saved edits, once loaded for this notebook; anything typed before they arrived stays on top.
  useEffect(() => {
    if (!query.data) return;
    const saved = query.data.edits.map((e) => [e.cell, e.code] as const);
    setEdits((typed) => new Map([...saved, ...typed]));
    setVersion((v) => v + 1);
    setLoaded(true);
  }, [query.data]);

  const send = useCallback(
    (cell: number, code: string, keepalive = false) => {
      const original = originals.get(cell);
      const url = `/api${path}/${cell}`;
      // keepalive lets the last save finish while the page closes.
      return code === original
        ? fetch(url, { method: 'DELETE', credentials: 'same-origin', keepalive })
        : fetch(url, {
            method: 'PUT',
            credentials: 'same-origin',
            keepalive,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          });
    },
    [originals, path],
  );

  const flush = useCallback(
    async (keepalive = false) => {
      clearTimeout(timer.current);
      const batch = [...pending.current];
      pending.current.clear();
      if (!batch.length) return true;
      setSaving('saving');
      try {
        const results = await Promise.all(batch.map(([cell, code]) => send(cell, code, keepalive)));
        const ok = results.every((r) => r.ok);
        setSaving(ok && pending.current.size === 0 ? 'saved' : 'failed');
        return ok;
      } catch {
        setSaving('failed');
        return false;
      }
    },
    [send],
  );

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
        setSaving('saving');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
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
        clearTimeout(timer.current);
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
  }, [edits, flush, originals, path, saving, version, loaded, query.isError]);

  return <CodeEditsContext.Provider value={value}>{children}</CodeEditsContext.Provider>;
}

/** The notebook's edits, where code can be edited here (the lab page). */
export function useCodeEdits() {
  return useContext(CodeEditsContext);
}

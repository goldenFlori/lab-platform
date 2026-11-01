import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CodeCell } from '../../notebook/types';
import type { CodeEdit, WorkSaved } from '../../shared/code-edits';
import { MAX_WORK_CELLS } from '../../shared/code-limits';
import { ApiError, api } from './api';
import { useMe } from './auth';
import { DRAFT_PREFIX, readDraft, writeDraft } from './drafts';
import { type NotebookRef, notebookQuery, notebooksPath, notebooksQuery } from './notebooks';
import { reportService, serviceOf } from './service';

// A student's own version of a notebook's code (#49): what they typed shows and runs instead of the
// original, and is saved for them as they type. Code put back exactly as it was is the original
// again, and its saved copy goes.
//
// Saving (#177): code and graded trace rows wait in one queue per notebook and go in one request, a
// few seconds after a change but at most once every SAVE_EVERY_MS, since every request counts against
// the free plan's daily limits. What waits is saved at once when the page is hidden or left, the
// notebook changes, or the student hands in; a failed save keeps its changes and tries again.
//
// On the device (#178): what waits is also kept in this browser's storage until it is saved, so a
// reload, a crash or a day's limit loses nothing; the next visit saves it. It is the user's own work,
// under their id, and goes when saved or when anyone signs out here (lab computers are shared).
//
// Versions (#208): every save names the notebook's version on the page. Staff may put a new version in
// place meanwhile; the server then moves the work to its cells' new places (or refuses work from an
// older version), and the page loads the new version. A device copy from another version is sent on
// its own, under its version, and not mixed into the page.

export type SaveState = 'saved' | 'pending' | 'saving' | 'failed';

type CodeEditsValue = {
  /** The code to show and run: the user's own, or the original. */
  code: (cell: CodeCell) => string;
  edited: (cell: CodeCell) => boolean;
  /** The original changed in a new version after the user saved their own (#208). */
  outdated: (cell: CodeCell) => boolean;
  /** The user's own code, by cell, where it differs from the original (#214). */
  ownCode: () => Map<number, string>;
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
  /** A table's rows kept on this device and not yet saved, which show instead of the saved ones. */
  traceDraft: (cell: number) => Record<string, string>[] | undefined;
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
/** After the free plan's limit answered, try again this often, not every 30 s, until the reset. */
const RETRY_AT_LIMIT_MS = 10 * 60_000;

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
  notebookVersion,
  changed,
  originals,
  children,
}: {
  notebookRef: NotebookRef;
  /** The version the page shows (#208). */
  notebookVersion: string;
  /** When the last new version came, and the cells it changed (#208). */
  changed: { at: string | null; cells: number[] };
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
  const userId = useMe()?.user.id;
  const draftKey = userId ? `${DRAFT_PREFIX}${userId}:${notebookRef.notebookId}` : null;
  // What this device kept of the last visit, read once; a copy typed on another version waits apart.
  const [stored] = useState(() => (draftKey ? readDraft(draftKey) : null));
  const sameVersion = !stored?.version || stored.version === notebookVersion;
  const draft = sameVersion ? stored : null;
  const olderDraft = sameVersion ? null : stored;
  const path = editsPath(notebookRef);
  const workPath = `${notebooksPath(notebookRef.org, notebookRef.courseId, notebookRef.labId)}/${encodeURIComponent(notebookRef.notebookId)}/work`;

  /** The device copy follows the queue: what waits is kept, and nothing once all is saved. */
  const keep = useCallback(() => {
    if (!draftKey) return;
    const waiting = pending.current.size || traces.current.size;
    writeDraft(
      draftKey,
      waiting
        ? {
            code: Object.fromEntries(pending.current),
            traces: Object.fromEntries(traces.current),
            at: Date.now(),
            version: notebookVersion,
          }
        : null,
    );
  }, [draftKey, notebookVersion]);

  /** Another version is in place (#208): load it, with the work as the server now keeps it. */
  const reloadNotebook = useCallback(() => {
    const { org, courseId, labId } = notebookRef;
    void queryClient.invalidateQueries({ queryKey: notebooksQuery(org, courseId, labId).queryKey, exact: true });
    void queryClient.invalidateQueries({ queryKey: notebookQuery(notebookRef).queryKey, exact: true });
    void queryClient.invalidateQueries({ queryKey: codeEditsQuery(notebookRef).queryKey });
  }, [notebookRef, queryClient]);

  // A device copy typed on an earlier version goes on its own, named by that version, so the server
  // puts it in the right cells; it is dropped once the server has answered.
  useEffect(() => {
    if (!olderDraft || !draftKey) return;
    api<WorkSaved>(workPath, {
      method: 'PUT',
      body: {
        code: Object.entries(olderDraft.code).map(([cell, code]) => ({ cell: Number(cell), code })),
        traces: Object.entries(olderDraft.traces).map(([cell, rows]) => ({ cell: Number(cell), rows })),
        version: olderDraft.version,
      },
    })
      .then(() => true)
      .catch((error: unknown) => error instanceof ApiError && error.code === 'stale_version')
      .then((answered) => {
        if (!answered) return;
        if (pending.current.size === 0 && traces.current.size === 0) writeDraft(draftKey, null);
        reloadNotebook();
      });
  }, [olderDraft, draftKey, workPath, reloadNotebook]);

  // The saved edits, once loaded for this notebook; anything typed before they arrived stays on top,
  // and over both, what this device kept unsaved last time (#178), which is queued again.
  useEffect(() => {
    if (!query.data) return;
    const saved = query.data.edits.map((e) => [e.cell, e.code] as const);
    const kept = Object.entries(draft?.code ?? {}).map(([cell, code]) => [Number(cell), code] as const);
    for (const [cell, code] of kept) if (!pending.current.has(cell)) pending.current.set(cell, code);
    for (const [cell, rows] of Object.entries(draft?.traces ?? {})) {
      if (!traces.current.has(Number(cell))) traces.current.set(Number(cell), rows);
    }
    setEdits((typed) => new Map([...saved, ...kept, ...typed]));
    setVersion((v) => v + 1);
    setLoaded(true);
  }, [query.data, draft]);

  /** One request with up to MAX_WORK_CELLS of what waits: kept, refused for the day's limit, or failed. */
  const send = useCallback(
    async (
      code: [number, string][],
      rows: [number, Record<string, string>[]][],
      keepalive: boolean,
    ): Promise<'ok' | 'limit' | 'failed'> => {
      const body = JSON.stringify({
        // The original code again means the saved copy goes.
        code: code.map(([cell, text]) => ({ cell, code: text === originals.get(cell) ? null : text })),
        traces: rows.map(([cell, r]) => ({ cell, rows: r })),
        version: notebookVersion,
      });
      let res: Response;
      try {
        res = await fetch(`/api${workPath}`, {
          method: 'PUT',
          credentials: 'same-origin',
          keepalive: keepalive && body.length < KEEPALIVE_BYTES,
          headers: { 'Content-Type': 'application/json' },
          body,
        });
      } catch {
        reportService(null);
        return 'failed';
      }
      reportService(res);
      if (res.status === 409) {
        // Typed on a version two or more behind (#208): it has no known place. The new one loads.
        reloadNotebook();
        return 'ok';
      }
      if (!res.ok) return serviceOf(res) === 'limit' ? 'limit' : 'failed';
      // A table whose notebook closed meanwhile cannot be kept: show it as it now is.
      const saved = (await res.json()) as WorkSaved;
      for (const cell of saved.refused) {
        void queryClient.invalidateQueries({ queryKey: ['trace-answers', notebookRef.notebookId, cell] });
      }
      if (saved.version !== notebookVersion) reloadNotebook();
      return 'ok';
    },
    [originals, workPath, queryClient, notebookRef.notebookId, notebookVersion, reloadNotebook],
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
        let outcome: 'ok' | 'limit' | 'failed' = 'ok';
        for (let i = 0; i < code.length + rows.length && outcome === 'ok'; i += MAX_WORK_CELLS) {
          const part = code.slice(i, i + MAX_WORK_CELLS);
          const left = MAX_WORK_CELLS - part.length;
          const from = Math.max(0, i - code.length);
          const tables = left > 0 ? rows.slice(from, from + left) : [];
          outcome = await send(part, tables, keepalive);
        }
        if (outcome === 'ok') {
          lastSave.current = Date.now();
          return true;
        }
        // Back in the queue, unless typed over since, and tried again later: at the day's limit only
        // now and then, since nothing is kept before the reset.
        for (const [cell, text] of code) if (!pending.current.has(cell)) pending.current.set(cell, text);
        for (const [cell, r] of rows) if (!traces.current.has(cell)) traces.current.set(cell, r);
        timer.current = setTimeout(() => void flush(), outcome === 'limit' ? RETRY_AT_LIMIT_MS : SAVE_EVERY_MS);
        return false;
      })();
      inFlight.current = run;
      const ok = await run;
      inFlight.current = null;
      keep();
      setSaving(!ok ? 'failed' : pending.current.size || traces.current.size ? 'pending' : 'saved');
      return ok;
    },
    [send, keep],
  );

  // What this device kept from last time is saved once the page has loaded.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when loaded
  useEffect(() => {
    if (loaded && (pending.current.size || traces.current.size)) schedule();
  }, [loaded]);

  // Back online: what waits goes now.
  useEffect(() => {
    const online = () => void flush();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [flush]);

  /** A change waits: SAVE_AFTER_MS after it, but never sooner than SAVE_EVERY_MS after the last save. */
  const schedule = useCallback(() => {
    keep();
    setSaving((state) => (state === 'failed' ? state : 'pending'));
    clearTimeout(timer.current);
    const wait = Math.max(SAVE_AFTER_MS, lastSave.current + SAVE_EVERY_MS - Date.now());
    timer.current = setTimeout(() => void flush(), wait);
  }, [flush, keep]);

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
      outdated: (cell) => {
        if (!changed.at || !changed.cells.includes(cell.srcIndex)) return false;
        const saved = query.data?.edits.find((e) => e.cell === cell.srcIndex);
        return saved !== undefined && saved.updatedAt < changed.at;
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
      traceDraft: (cell) => draft?.traces[cell],
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
      ownCode: () => new Map([...edits].filter(([cell, code]) => code !== originals.get(cell))),
      saving,
      version,
      ready: loaded || query.isError,
      flush: () => flush(),
    };
  }, [edits, flush, schedule, draft, originals, path, saving, version, loaded, query.isError, query.data, changed]);

  return <CodeEditsContext.Provider value={value}>{children}</CodeEditsContext.Provider>;
}

/** The notebook's edits, where code can be edited here (the lab page). */
export function useCodeEdits() {
  return useContext(CodeEditsContext);
}

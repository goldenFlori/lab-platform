import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useMemo, useRef } from 'react';
import type { TraceAnswers } from '../../shared/trace-answers';
import { type HandIn, VizHandIn } from '../../viz/kit/hand-in';
import { api } from './api';
import { useCodeEdits } from './code-edits';
import { type NotebookRef, notebooksPath } from './notebooks';

// A graded trace table's rows (#168): loaded once, and saved with the notebook's code in its one save
// queue (#177), so handing in waits for them too. Outside a lab page's notebook there is no queue,
// and a table saves on its own a moment after the student stops typing.

const SAVE_AFTER = 3000;

export function HandInProvider({
  notebookRef,
  cell,
  children,
}: {
  notebookRef: NotebookRef;
  cell: number;
  children: ReactNode;
}) {
  const path = `${notebooksPath(notebookRef.org, notebookRef.courseId, notebookRef.labId)}/${encodeURIComponent(notebookRef.notebookId)}/embeds/${cell}/trace`;
  const query = useQuery({
    queryKey: ['trace-answers', notebookRef.notebookId, cell],
    queryFn: () => api<TraceAnswers>(path),
  });
  const timer = useRef<number | undefined>(undefined);
  const queue = useCodeEdits();
  const value = useMemo<HandIn>(
    () => ({
      // Rows this device kept unsaved (#178) show over the saved ones until they are saved.
      state: query.data && queue?.traceDraft(cell) ? { ...query.data, rows: queue.traceDraft(cell) ?? [] } : query.data,
      save(rows) {
        if (queue) return queue.saveTrace(cell, rows);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          api(path, { method: 'PUT', body: { rows } }).catch(() => {});
        }, SAVE_AFTER);
      },
    }),
    [query.data, path, queue, cell],
  );
  return <VizHandIn.Provider value={value}>{children}</VizHandIn.Provider>;
}

import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useMemo, useRef } from 'react';
import type { TraceAnswers } from '../../shared/trace-answers';
import { type HandIn, VizHandIn } from '../../viz/kit/hand-in';
import { api } from './api';
import { type NotebookRef, notebooksPath } from './notebooks';

// A graded trace table's rows (#168): loaded once, saved a moment after the student stops typing.

const SAVE_AFTER = 700;

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
  const value = useMemo<HandIn>(
    () => ({
      state: query.data,
      save(rows) {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          api(path, { method: 'PUT', body: { rows } }).catch(() => {});
        }, SAVE_AFTER);
      },
    }),
    [query.data, path],
  );
  return <VizHandIn.Provider value={value}>{children}</VizHandIn.Provider>;
}

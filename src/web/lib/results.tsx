import { type ReactNode, useMemo } from 'react';
import type { PredictionInput } from '../../shared/predictions';
import { type ReportResult, VizResults } from '../../viz/kit/results';
import { api } from './api';
import { type NotebookRef, notebooksPath } from './notebooks';

// First-try results (#151): what an embedded visualization reports goes to the API once per decision
// in this page's life; the server keeps only the very first answer anyway.

const sent = new Set<string>();

function reporter(ref: NotebookRef, cell: number): ReportResult {
  const path = `${notebooksPath(ref.org, ref.courseId, ref.labId)}/${encodeURIComponent(ref.notebookId)}/embeds/${cell}/results`;
  return (result: PredictionInput) => {
    const key = `${ref.notebookId}|${cell}|${result.decision}`;
    if (sent.has(key)) return;
    sent.add(key);
    api(path, { method: 'POST', body: result }).catch(() => sent.delete(key));
  };
}

/** Around a visualization embedded in a lab's notebook: it reports the student's first answers. */
export function ResultsProvider({
  notebookRef,
  cell,
  children,
}: {
  notebookRef: NotebookRef;
  cell: number;
  children: ReactNode;
}) {
  const report = useMemo(() => reporter(notebookRef, cell), [notebookRef, cell]);
  return <VizResults.Provider value={report}>{children}</VizResults.Provider>;
}

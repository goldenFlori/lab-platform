import { useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import type { NotebookRef } from './notebooks';
import { mySubmissionQuery } from './submissions';

// The pedagog's comments beside a student's cells (#220), on the student's own lab page once their
// grade is released. From the same request as the hand-in bar, so nothing more is asked.

const GradeCommentsContext = createContext<ReadonlyMap<number, string>>(new Map());

export function GradeCommentsProvider({
  notebookRef,
  enabled,
  children,
}: {
  notebookRef: NotebookRef;
  /** Students only: staff read comments where they write them. */
  enabled: boolean;
  children: ReactNode;
}) {
  const query = useQuery({ ...mySubmissionQuery(notebookRef), enabled });
  const comments = query.data?.grade?.comments;
  const value = useMemo(() => new Map((comments ?? []).map((c) => [c.cell, c.text])), [comments]);
  return <GradeCommentsContext.Provider value={value}>{children}</GradeCommentsContext.Provider>;
}

/** The pedagog's comment on this cell, if the user's released grade has one. */
export const useGradeComment = (cell: number) => useContext(GradeCommentsContext).get(cell);

import { useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import type { CheckStatus } from '../../shared/exercises';
import type { NotebookRef } from './notebooks';
import { mySubmissionQuery } from './submissions';

// What a released grade says about the student's cells, on their own lab page: the pedagog's comments
// beside them (#220) and how each exercise did in the re-run (#227). From the same request as the
// hand-in bar, so nothing more is asked.

type GradeNotes = { comments: ReadonlyMap<number, string>; results: ReadonlyMap<number, CheckStatus> };

const GradeNotesContext = createContext<GradeNotes>({ comments: new Map(), results: new Map() });

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
  const grade = query.data?.grade;
  const value = useMemo(
    () => ({
      comments: new Map((grade?.comments ?? []).map((c) => [c.cell, c.text])),
      results: new Map((grade?.results ?? []).map((r) => [r.cell, r.status])),
    }),
    [grade],
  );
  return <GradeNotesContext.Provider value={value}>{children}</GradeNotesContext.Provider>;
}

/** The pedagog's comment on this cell, if the user's released grade has one. */
export const useGradeComment = (cell: number) => useContext(GradeNotesContext).comments.get(cell);

/** How this exercise did in the user's released grade, if it has one. */
export const useGradeResult = (cell: number) => useContext(GradeNotesContext).results.get(cell);

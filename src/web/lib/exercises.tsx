import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useMemo, useRef } from 'react';
import type { CodeCell } from '../../notebook/types';
import type { Exercise, ExerciseProgress } from '../../shared/exercises';
import { api } from './api';
import { type NotebookRef, notebookQuery, notebooksPath } from './notebooks';

// A notebook's exercises on the lab page (#51): which cells check the student's work, which ones
// this student has solved, and for staff with analytics how many of their students have.

type ExercisesValue = {
  of: (cell: CodeCell) => Exercise | undefined;
  solved: (cell: CodeCell) => boolean;
  /** Staff with analytics: how many of their students solved it, of how many. */
  progress: (cell: CodeCell) => { solved: number; of: number } | null;
  /** The cell's check passed: kept for the student, the first time. */
  passed: (cell: CodeCell) => void;
};

const ExercisesContext = createContext<ExercisesValue | null>(null);

const exercisesPath = (ref: NotebookRef) =>
  `${notebooksPath(ref.org, ref.courseId, ref.labId)}/${encodeURIComponent(ref.notebookId)}/exercises`;

export const exerciseProgressQuery = (ref: NotebookRef) => ({
  queryKey: [...notebookQuery(ref).queryKey, 'exercises'],
  queryFn: () => api<ExerciseProgress>(`${exercisesPath(ref)}/progress`),
});

export function ExercisesProvider({
  notebookRef,
  exercises,
  children,
}: {
  notebookRef: NotebookRef;
  exercises: Exercise[];
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({ ...exerciseProgressQuery(notebookRef), enabled: exercises.length > 0 });
  const ref = useRef(notebookRef);
  ref.current = notebookRef;

  const value = useMemo<ExercisesValue>(() => {
    const byCell = new Map(exercises.map((e) => [e.cell, e]));
    const solved = new Set(query.data?.done ?? []);
    const counts = query.data?.counts ? new Map(query.data.counts.map((c) => [c.cell, c.students])) : null;
    const of = query.data?.students ?? 0;
    return {
      of: (cell) => byCell.get(cell.srcIndex),
      solved: (cell) => solved.has(cell.srcIndex),
      progress: (cell) => (counts && byCell.has(cell.srcIndex) ? { solved: counts.get(cell.srcIndex) ?? 0, of } : null),
      passed(cell) {
        if (!byCell.has(cell.srcIndex) || solved.has(cell.srcIndex)) return;
        const key = exerciseProgressQuery(ref.current).queryKey;
        queryClient.setQueryData<ExerciseProgress>(key, (data) =>
          data ? { ...data, done: [...data.done, cell.srcIndex].sort((a, b) => a - b) } : data,
        );
        api(`${exercisesPath(ref.current)}/${cell.srcIndex}/done`, { method: 'POST' }).catch(() =>
          queryClient.invalidateQueries({ queryKey: key }),
        );
      },
    };
  }, [exercises, query.data, queryClient]);

  return <ExercisesContext.Provider value={value}>{children}</ExercisesContext.Provider>;
}

/** The notebook's exercises, where they are checked (the lab page). */
export function useExercises() {
  return useContext(ExercisesContext);
}

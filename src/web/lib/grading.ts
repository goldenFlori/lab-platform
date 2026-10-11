import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { StoredNotebook } from '../../notebook/stored';
import type { Exercise } from '../../shared/exercises';
import type { ExerciseGrading, StaffGrade } from '../../shared/grading';
import { api } from './api';
import { type NotebookRef, notebookQuery, notebooksPath } from './notebooks';

// Grading on the pedagog's machine (#53): points and hidden tests, a group's grades, the batch run
// that makes them, adjustments and release.

const base = (ref: NotebookRef) =>
  `${notebooksPath(ref.org, ref.courseId, ref.labId)}/${encodeURIComponent(ref.notebookId)}`;

export const gradingSetupQuery = (ref: NotebookRef) =>
  queryOptions({
    queryKey: [...notebookQuery(ref).queryKey, 'grading'],
    queryFn: () => api<{ exercises: ExerciseGrading[] }>(`${base(ref)}/grading`),
    retry: false,
  });

export const gradesQuery = (ref: NotebookRef, group: string) =>
  queryOptions({
    queryKey: [...notebookQuery(ref).queryKey, 'grades', group],
    queryFn: () => api<{ grades: StaffGrade[] }>(`${base(ref)}/grades?group=${encodeURIComponent(group)}`),
  });

export function useGradingChanges(ref: NotebookRef, group: string) {
  const queryClient = useQueryClient();
  const refreshGrades = () => queryClient.invalidateQueries({ queryKey: gradesQuery(ref, group).queryKey });
  return {
    saveSetup: useMutation({
      mutationFn: (exercises: ExerciseGrading[]) =>
        api<{ exercises: ExerciseGrading[] }>(`${base(ref)}/grading`, { method: 'PUT', body: { exercises } }),
      onSuccess: (data) => queryClient.setQueryData(gradingSetupQuery(ref).queryKey, data),
    }),
    review: useMutation({
      mutationFn: ({ userId, score, feedback }: { userId: string; score: number | null; feedback: string | null }) =>
        api<StaffGrade>(`${base(ref)}/grades/${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          body: { score, feedback },
        }),
      onSuccess: refreshGrades,
    }),
    release: useMutation({
      mutationFn: () => api<void>(`${base(ref)}/grades/release?group=${encodeURIComponent(group)}`, { method: 'POST' }),
      onSuccess: refreshGrades,
    }),
    refreshGrades,
  };
}

/**
 * Re-runs every submission of the group in this browser, one fresh Python each, and stores each
 * grade as it is made. Python and the grader load only when a batch starts.
 */
export async function gradeGroup(
  ref: NotebookRef,
  group: string,
  notebook: StoredNotebook,
  exercises: Exercise[],
  grading: ExerciseGrading[],
  onProgress: (done: number, total: number) => void,
) {
  const [{ gradeSubmission }, { submissions }] = await Promise.all([
    import('../python/grade'),
    api<{ submissions: { userId: string; code: { cell: number; code: string }[] }[] }>(
      `${base(ref)}/grading/submissions?group=${encodeURIComponent(group)}`,
    ),
  ]);
  onProgress(0, submissions.length);
  for (const [i, submission] of submissions.entries()) {
    const outcome = await gradeSubmission(notebook, submission.code, exercises, grading);
    await api(`${base(ref)}/grades/${encodeURIComponent(submission.userId)}`, { method: 'PUT', body: outcome });
    onProgress(i + 1, submissions.length);
  }
}

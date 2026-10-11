import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Assignment, MySubmission, SubmissionDetail, SubmissionList } from '../../shared/submissions';
import { api } from './api';
import { type NotebookRef, notebookQuery, notebooksPath } from './notebooks';

// Handing in work (#52): the student's own submission, and for staff the deadlines per group and
// what each group's students handed in.

const notebookPath = (ref: NotebookRef) =>
  `${notebooksPath(ref.org, ref.courseId, ref.labId)}/${encodeURIComponent(ref.notebookId)}`;

export const mySubmissionQuery = (ref: NotebookRef) =>
  queryOptions({
    queryKey: [...notebookQuery(ref).queryKey, 'submission'],
    queryFn: () => api<MySubmission>(`${notebookPath(ref)}/submission`),
  });

export const assignmentsQuery = (ref: NotebookRef) =>
  queryOptions({
    queryKey: [...notebookQuery(ref).queryKey, 'assignments'],
    queryFn: () => api<Assignment[]>(`${notebookPath(ref)}/assignments`),
  });

export const submissionListQuery = (ref: NotebookRef, group: string | undefined) =>
  queryOptions({
    queryKey: [...notebookQuery(ref).queryKey, 'submissions', group ?? null],
    queryFn: () =>
      api<SubmissionList>(`${notebookPath(ref)}/submissions${group ? `?group=${encodeURIComponent(group)}` : ''}`),
  });

export const submissionDetailQuery = (ref: NotebookRef, userId: string) =>
  queryOptions({
    queryKey: [...notebookQuery(ref).queryKey, 'submissions', 'of', userId],
    queryFn: () => api<SubmissionDetail>(`${notebookPath(ref)}/submissions/${encodeURIComponent(userId)}`),
  });

/** The student hands in their saved work. */
export function useSubmit(ref: NotebookRef) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<MySubmission>(`${notebookPath(ref)}/submission`, { method: 'POST' }),
    onSuccess: (data) => queryClient.setQueryData(mySubmissionQuery(ref).queryKey, data),
  });
}

/** Staff open the notebook to a group until a deadline, move it, or close it. */
export function useAssignmentChanges(ref: NotebookRef) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: assignmentsQuery(ref).queryKey });
  return {
    open: useMutation({
      mutationFn: ({ groupId, dueAt }: { groupId: string; dueAt: string }) =>
        api<Assignment>(`${notebookPath(ref)}/assignments/${encodeURIComponent(groupId)}`, {
          method: 'PUT',
          body: { dueAt },
        }),
      onSuccess: refresh,
    }),
    close: useMutation({
      mutationFn: (groupId: string) =>
        api<void>(`${notebookPath(ref)}/assignments/${encodeURIComponent(groupId)}`, { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  };
}

import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type {
  Assignment,
  Kolokium,
  KolokiumSetup,
  MySubmission,
  SubmissionDetail,
  SubmissionList,
} from '../../shared/submissions';
import { api } from './api';
import { labQuery, labsQuery } from './labs';
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
    onSuccess: (data) => {
      queryClient.setQueryData(mySubmissionQuery(ref).queryKey, data);
      // A kolokium ends with its hand-in, and the lab's card says so (#169).
      if (data.kolokium) {
        void queryClient.invalidateQueries({
          queryKey: labQuery(ref.org, ref.courseId, ref.labId).queryKey,
          exact: true,
        });
      }
    },
  });
}

/** Staff open the notebook to a group until a deadline, move it, or close it. */
export function useAssignmentChanges(ref: NotebookRef) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: assignmentsQuery(ref).queryKey });
  return {
    open: useMutation({
      mutationFn: ({ groupId, dueAt, kolokium }: { groupId: string; dueAt: string; kolokium: KolokiumSetup | null }) =>
        api<Assignment>(`${notebookPath(ref)}/assignments/${encodeURIComponent(groupId)}`, {
          method: 'PUT',
          body: { dueAt, kolokium },
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

/**
 * The student starts their kolokium's clock (#169). Its notebook opens to them then, so the lab and
 * its notebooks load again.
 */
export function useStartKolokium(org: string, courseId: string, labId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notebookId: string) =>
      api<Kolokium>(`${notebooksPath(org, courseId, labId)}/${encodeURIComponent(notebookId)}/kolokium/start`, {
        method: 'POST',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: labsQuery(org, courseId).queryKey }),
  });
}

/** The time now, again every `ms` while `running`: for a countdown. */
export function useNow(running: boolean, ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [running, ms]);
  return now;
}

/** "42:07", or "1:02:07" from an hour: what is left of a kolokium. */
export function clock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  const [h, m, sec] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

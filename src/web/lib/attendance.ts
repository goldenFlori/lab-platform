import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttendanceStatus, GroupAttendance } from '../../shared/attendance-status';
import { api } from './api';

// Attendance for a lab hour (#222): a group's registers, for staff who manage its students.

const path = (org: string, courseId: string, groupId: string) =>
  `/orgs/${encodeURIComponent(org)}/courses/${encodeURIComponent(courseId)}/groups/${encodeURIComponent(groupId)}/attendance`;

export const attendanceQuery = (org: string, courseId: string, groupId: string) =>
  queryOptions({
    queryKey: ['orgs', org, 'courses', courseId, 'groups', groupId, 'attendance'],
    queryFn: () => api<GroupAttendance>(path(org, courseId, groupId)),
  });

/** Today in the institution's time zone, as the registers keep days. */
export const todayHere = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Tirane' });

export function useAttendanceChanges(org: string, courseId: string, groupId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = attendanceQuery(org, courseId, groupId);
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const base = path(org, courseId, groupId);
  return {
    open: useMutation({
      mutationFn: (values: { day: string; labId: string }) =>
        api<{ id: string }>(base, { method: 'POST', body: values }),
      onSuccess: refresh,
    }),
    mark: useMutation({
      mutationFn: ({ sessionId, userId, status }: { sessionId: string; userId: string; status: AttendanceStatus }) =>
        api<void>(`${base}/${encodeURIComponent(sessionId)}/marks/${encodeURIComponent(userId)}`, {
          method: 'PUT',
          body: { status },
        }),
      // Shown at once; the server's answer follows.
      onMutate: ({ sessionId, userId, status }) =>
        queryClient.setQueryData<GroupAttendance>(queryKey, (data) =>
          data
            ? {
                ...data,
                marks: [
                  ...data.marks.filter((m) => !(m.sessionId === sessionId && m.userId === userId)),
                  { sessionId, userId, status },
                ],
              }
            : data,
        ),
      onError: refresh,
    }),
    remove: useMutation({
      mutationFn: (sessionId: string) => api<void>(`${base}/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  };
}

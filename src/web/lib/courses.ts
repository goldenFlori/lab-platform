import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AccessSummary } from '../../shared/capabilities';
import type { CourseDetail, CourseSummary, GroupView, JoinResult } from '../../shared/courses';
import type { Locale } from '../../shared/locale';
import { api } from './api';

const orgPath = (org: string) => `/orgs/${encodeURIComponent(org)}`;

export const orgAccessQuery = (org: string) =>
  queryOptions({ queryKey: ['orgs', org, 'access'], queryFn: () => api<AccessSummary>(`${orgPath(org)}/access`) });

export const coursesQuery = (org: string) =>
  queryOptions({ queryKey: ['orgs', org, 'courses'], queryFn: () => api<CourseSummary[]>(`${orgPath(org)}/courses`) });

export const courseQuery = (org: string, courseId: string) =>
  queryOptions({
    queryKey: ['orgs', org, 'courses', courseId],
    queryFn: () => api<CourseDetail>(`${orgPath(org)}/courses/${encodeURIComponent(courseId)}`),
  });

/** After any change in an organization, refetch what was shown from it. */
function useRefresh(org: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['orgs', org] });
}

export function useCreateCourse(org: string) {
  const refresh = useRefresh(org);
  return useMutation({
    mutationFn: (input: { title: string; academicYear: string; locale?: Locale | null; copyFromCourseId?: string }) =>
      api<CourseSummary>(`${orgPath(org)}/courses`, { method: 'POST', body: input }),
    onSuccess: refresh,
  });
}

export function useCourseChanges(org: string, courseId: string) {
  const onSuccess = useRefresh(org);
  const queryClient = useQueryClient();
  const base = `${orgPath(org)}/courses/${encodeURIComponent(courseId)}`;
  return {
    archive: useMutation({
      mutationFn: (archived: boolean) =>
        api<CourseSummary>(`${base}/${archived ? 'archive' : 'unarchive'}`, { method: 'POST' }),
      onSuccess,
    }),
    /** Deletes it; the page leaves before the course's data is forgotten, so it never shows "not found". */
    remove: useMutation({
      mutationFn: () => api<void>(base, { method: 'DELETE' }),
    }),
    forget: () => {
      queryClient.removeQueries({ queryKey: courseQuery(org, courseId).queryKey });
      void queryClient.invalidateQueries({ queryKey: coursesQuery(org).queryKey, exact: true });
    },
    setLocale: useMutation({
      mutationFn: (locale: Locale | null) => api<CourseSummary>(base, { method: 'PATCH', body: { locale } }),
      onSuccess,
    }),
    setAi: useMutation({
      mutationFn: (ai: boolean) => api<CourseSummary>(base, { method: 'PATCH', body: { ai } }),
      onSuccess,
    }),
    addGroup: useMutation({
      mutationFn: (name: string) => api<GroupView>(`${base}/groups`, { method: 'POST', body: { name } }),
      onSuccess,
    }),
    deleteGroup: useMutation({
      mutationFn: (groupId: string) => api<void>(`${base}/groups/${groupId}`, { method: 'DELETE' }),
      onSuccess,
    }),
    switchJoinCode: useMutation({
      mutationFn: ({ groupId, enabled }: { groupId: string; enabled: boolean }) =>
        api<{ joinCode: string | null }>(`${base}/groups/${groupId}/join-code`, { method: 'POST', body: { enabled } }),
      onSuccess,
    }),
  };
}

export function useJoin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api<JoinResult>('/join', { method: 'POST', body: { code } }),
    // Joining can add a whole organization to the account, so refresh everything about the user.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

/** The academic year in progress: from September on, the one starting this year. */
export function currentAcademicYear(now = new Date()) {
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

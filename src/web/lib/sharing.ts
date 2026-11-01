import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CourseSummary } from '../../shared/courses';
import type { CourseShareView, SharePreview } from '../../shared/sharing';
import { ApiError, api } from './api';

// Sharing a course with other institutions (#203): the author's link and its copies, and the page
// the link opens, where staff of another institution copy the course.

const coursePath = (org: string, courseId: string) =>
  `/orgs/${encodeURIComponent(org)}/courses/${encodeURIComponent(courseId)}`;

export const courseShareQuery = (org: string, courseId: string) =>
  queryOptions({
    queryKey: ['orgs', org, 'courses', courseId, 'share'],
    queryFn: () => api<CourseShareView>(`${coursePath(org, courseId)}/share`),
  });

/** The page a share link opens. */
export const shareLink = (token: string) => `${window.location.origin}/share/${token}`;

export function useShareChanges(org: string, courseId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = courseShareQuery(org, courseId);
  return {
    set: useMutation({
      mutationFn: (solutions: boolean) =>
        api<CourseShareView>(`${coursePath(org, courseId)}/share`, { method: 'PUT', body: { solutions } }),
      onSuccess: (view) => queryClient.setQueryData(queryKey, view),
    }),
    stop: useMutation({
      mutationFn: () => api<void>(`${coursePath(org, courseId)}/share`, { method: 'DELETE' }),
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    }),
  };
}

/** What a link offers; null when it does not work for this user (stopped, wrong, or not staff anywhere). */
export const sharePreviewQuery = (token: string) =>
  queryOptions({
    queryKey: ['shares', token],
    queryFn: async () => {
      try {
        return await api<SharePreview>(`/shares/${encodeURIComponent(token)}`);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });

export function useCopyShare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ org, ...input }: { org: string; token: string; title: string; academicYear: string }) =>
      api<CourseSummary>(`/orgs/${encodeURIComponent(org)}/courses/from-share`, { method: 'POST', body: input }),
    onSuccess: (_, { org }) => queryClient.invalidateQueries({ queryKey: ['orgs', org] }),
  });
}

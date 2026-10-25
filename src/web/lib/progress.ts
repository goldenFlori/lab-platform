import { queryOptions } from '@tanstack/react-query';
import type { MyProgress } from '../../shared/progress';
import type { ReviewPlan } from '../../shared/review';
import { api } from './api';

// "My progress" (#99): the signed-in user's own labs, exercises, submissions and grades.

export const progressQuery = (org: string, courseId: string) =>
  queryOptions({
    queryKey: ['orgs', org, 'courses', courseId, 'progress'],
    queryFn: () => api<MyProgress>(`/orgs/${encodeURIComponent(org)}/courses/${encodeURIComponent(courseId)}/progress`),
  });

/** The review session's plan (#152): the topics of the labs the user opened, and their results. */
export const reviewQuery = (org: string, courseId: string) =>
  queryOptions({
    queryKey: ['orgs', org, 'courses', courseId, 'review'],
    queryFn: () => api<ReviewPlan>(`/orgs/${encodeURIComponent(org)}/courses/${encodeURIComponent(courseId)}/review`),
  });

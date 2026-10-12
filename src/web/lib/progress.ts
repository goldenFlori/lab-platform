import { queryOptions } from '@tanstack/react-query';
import type { MyProgress } from '../../shared/progress';
import { api } from './api';

// "My progress" (#99): the signed-in user's own labs, exercises, submissions and grades.

export const progressQuery = (org: string, courseId: string) =>
  queryOptions({
    queryKey: ['orgs', org, 'courses', courseId, 'progress'],
    queryFn: () => api<MyProgress>(`/orgs/${encodeURIComponent(org)}/courses/${encodeURIComponent(courseId)}/progress`),
  });

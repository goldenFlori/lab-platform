import { queryOptions } from '@tanstack/react-query';
import type { ActivityReport } from '../../shared/activity';
import { api } from './api';

// Learning activity (#18): the course's report for staff, and the one thing the app reports itself.

const coursePath = (org: string, courseId: string) =>
  `/orgs/${encodeURIComponent(org)}/courses/${encodeURIComponent(courseId)}`;

export const activityQuery = (org: string, courseId: string, group: string | undefined) =>
  queryOptions({
    queryKey: ['orgs', org, 'courses', courseId, 'activity', group ?? null],
    queryFn: () =>
      api<ActivityReport>(`${coursePath(org, courseId)}/activity${group ? `?group=${encodeURIComponent(group)}` : ''}`),
  });

/** A student used a visualization in this lab. Fire and forget: activity never gets in the way. */
export function reportVisualizationUsed(org: string, courseId: string, labId: string) {
  void fetch(`/api${coursePath(org, courseId)}/labs/${encodeURIComponent(labId)}/activity`, {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'visualization' }),
  }).catch(() => {});
}

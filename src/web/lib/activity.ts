import { queryOptions } from '@tanstack/react-query';
import type { ActivityReport } from '../../shared/activity';
import type { UnderstandingReport } from '../../shared/predictions';
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

/** First-try results of predictions and trace tables (#151), for the same staff. */
export const understandingQuery = (org: string, courseId: string, group: string | undefined) =>
  queryOptions({
    queryKey: ['orgs', org, 'courses', courseId, 'understanding', group ?? null],
    queryFn: () =>
      api<UnderstandingReport>(
        `${coursePath(org, courseId)}/understanding${group ? `?group=${encodeURIComponent(group)}` : ''}`,
      ),
  });

/** A student used a visualization in this lab, or ran its code. Fire and forget: activity never gets in the way. */
function report(org: string, courseId: string, labId: string, kind: 'visualization' | 'run') {
  void fetch(`/api${coursePath(org, courseId)}/labs/${encodeURIComponent(labId)}/activity`, {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind }),
  }).catch(() => {});
}

export const reportVisualizationUsed = (org: string, courseId: string, labId: string) =>
  report(org, courseId, labId, 'visualization');

/** Labs whose run was reported since the page loaded: the server keeps one a day anyway (#101). */
const ran = new Set<string>();

export function reportRun(org: string, courseId: string, labId: string) {
  if (ran.has(labId)) return;
  ran.add(labId);
  report(org, courseId, labId, 'run');
}

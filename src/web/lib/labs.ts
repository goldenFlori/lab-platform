import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LabList, LabRule, LabView } from '../../shared/labs';
import { t } from '../i18n';
import { api } from './api';

const labsPath = (org: string, courseId: string) =>
  `/orgs/${encodeURIComponent(org)}/courses/${encodeURIComponent(courseId)}/labs`;

export const labsQuery = (org: string, courseId: string) =>
  queryOptions({
    queryKey: ['orgs', org, 'courses', courseId, 'labs'],
    queryFn: () => api<LabList>(labsPath(org, courseId)),
  });

export const labQuery = (org: string, courseId: string, labId: string) =>
  queryOptions({
    // Under the list's key, so whatever refreshes the list refreshes the lab too.
    queryKey: [...labsQuery(org, courseId).queryKey, labId],
    queryFn: () => api<LabView>(`${labsPath(org, courseId)}/${encodeURIComponent(labId)}`),
  });

export type LabFields = { n: number; title: string; week: number | null; summary: string | null };

export function useLabChanges(org: string, courseId: string) {
  const queryClient = useQueryClient();
  const key = labsQuery(org, courseId).queryKey;
  const base = labsPath(org, courseId);

  // A changed lab replaces its old version in the list at once, then the list is refetched.
  const replace = (lab: LabView) => {
    queryClient.setQueryData(key, (list) =>
      list ? { ...list, labs: list.labs.map((old) => (old.id === lab.id ? lab : old)) } : list,
    );
    return queryClient.invalidateQueries({ queryKey: key });
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  return {
    setRule: useMutation({
      mutationFn: ({ labId, rule }: { labId: string; rule: LabRule }) =>
        api<LabView>(`${base}/${labId}/access`, { method: 'PUT', body: rule }),
      onSuccess: replace,
    }),
    followCourse: useMutation({
      mutationFn: ({ labId, groupId }: { labId: string; groupId: string }) =>
        api<LabView>(`${base}/${labId}/access/${groupId}`, { method: 'DELETE' }),
      onSuccess: replace,
    }),
    addLab: useMutation({
      mutationFn: (fields: LabFields) => api<LabView>(base, { method: 'POST', body: fields }),
      onSuccess: refresh,
    }),
    updateLab: useMutation({
      mutationFn: ({ labId, fields }: { labId: string; fields: LabFields }) =>
        api<LabView>(`${base}/${labId}`, { method: 'PATCH', body: fields }),
      onSuccess: replace,
    }),
    deleteLab: useMutation({
      mutationFn: (labId: string) => api<void>(`${base}/${labId}`, { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  };
}

/** A stored moment as the value of a datetime-local input, in this browser's time zone. */
export function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

/**
 * "11 tetor 2026, 10:00" (or "11 October 2026, 10:00") in this browser's time zone. Spelled out
 * from the messages rather than through Intl, because not every browser carries Albanian locale data.
 */
export function formatMoment(iso: string) {
  const date = new Date(iso);
  const { common, labs } = t();
  return labs.moment(date.getDate(), common.months[date.getMonth()] ?? '', date.getFullYear(), formatTime(iso));
}

/** "10:00" in this browser's time zone. */
export function formatTime(iso: string) {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

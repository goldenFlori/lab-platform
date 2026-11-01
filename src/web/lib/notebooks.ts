import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { StoredNotebook } from '../../notebook/stored';
import type { Exercise } from '../../shared/exercises';
import { RENDERED_FILE } from '../../shared/notebook-files';
import type { Embed, NotebookDetail, NotebookSummary } from '../../shared/notebooks';
import { api } from './api';

export const notebooksPath = (org: string, courseId: string, labId: string) =>
  `/orgs/${encodeURIComponent(org)}/courses/${encodeURIComponent(courseId)}/labs/${encodeURIComponent(labId)}/notebooks`;

export type NotebookRef = { org: string; courseId: string; labId: string; notebookId: string };

export const notebooksQuery = (org: string, courseId: string, labId: string) =>
  queryOptions({
    queryKey: ['orgs', org, 'courses', courseId, 'labs', labId, 'notebooks'],
    queryFn: () => api<{ notebooks: NotebookSummary[] }>(notebooksPath(org, courseId, labId)),
  });

export const notebookQuery = ({ org, courseId, labId, notebookId }: NotebookRef) =>
  queryOptions({
    queryKey: ['orgs', org, 'courses', courseId, 'labs', labId, 'notebooks', notebookId],
    queryFn: () => api<NotebookDetail>(`${notebooksPath(org, courseId, labId)}/${encodeURIComponent(notebookId)}`),
  });

/**
 * A file of a notebook, read with the signed-in user's session (images, figures, the original). The
 * notebook's version (#208) goes in the address: the browser keeps files for an hour, and a new version
 * replaces the original and the rendering under the same names.
 */
export const notebookFileUrl = ({ org, courseId, labId, notebookId }: NotebookRef, name: string, version: string) =>
  `/api${notebooksPath(org, courseId, labId)}/${encodeURIComponent(notebookId)}/files/${encodeURIComponent(name)}?v=${encodeURIComponent(version)}`;

export const renderedQuery = (ref: NotebookRef, version: string) =>
  queryOptions({
    queryKey: [...notebookQuery(ref).queryKey, RENDERED_FILE, version],
    queryFn: async () => {
      // Stored gzipped; the browser unpacks it on arrival.
      const res = await fetch(notebookFileUrl(ref, RENDERED_FILE, version), { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`rendered notebook: ${res.status}`);
      return (await res.json()) as StoredNotebook;
    },
    // A rendering changes only with a new version, which is a new key.
    staleTime: Number.POSITIVE_INFINITY,
  });

/** Staff changes to a lab's notebooks; each keeps what is shown in step with the server. */
export function useNotebookChanges(org: string, courseId: string, labId: string) {
  const queryClient = useQueryClient();
  const base = notebooksPath(org, courseId, labId);
  // Only the list: a notebook's rendering never changes, so it is not fetched again.
  const refreshList = () =>
    queryClient.invalidateQueries({ queryKey: notebooksQuery(org, courseId, labId).queryKey, exact: true });
  const keep = (detail: NotebookDetail) =>
    queryClient.setQueryData(notebookQuery({ org, courseId, labId, notebookId: detail.id }).queryKey, detail);

  return {
    base,
    /** After an upload: show the new notebook at once. */
    uploaded: (detail: NotebookDetail) => {
      keep(detail);
      return refreshList();
    },
    saveEmbeds: useMutation({
      mutationFn: ({ notebookId, embeds }: { notebookId: string; embeds: Embed[] }) =>
        api<NotebookDetail>(`${base}/${encodeURIComponent(notebookId)}/embeds`, { method: 'PUT', body: { embeds } }),
      onSuccess: keep,
    }),
    saveExercises: useMutation({
      mutationFn: ({ notebookId, exercises }: { notebookId: string; exercises: Exercise[] }) =>
        api<NotebookDetail>(`${base}/${encodeURIComponent(notebookId)}/exercises`, {
          method: 'PUT',
          body: { exercises },
        }),
      onSuccess: keep,
    }),
    deleteNotebook: useMutation({
      mutationFn: (notebookId: string) => api<void>(`${base}/${encodeURIComponent(notebookId)}`, { method: 'DELETE' }),
      onSuccess: refreshList,
    }),
  };
}

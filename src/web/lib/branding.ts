import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { Branding } from '../../shared/branding';
import { ApiError, api } from './api';

// An institution's branding (#201): its members read it, its admins change it; the sign-in page reached
// from a join code reads it by the code. Its accent becomes the app's in the light theme while one of
// its pages is open (the dark theme keeps the platform's, made for it).

export const brandingQuery = (org: string) =>
  queryOptions({
    queryKey: ['orgs', org, 'branding'],
    queryFn: () => api<Branding>(`/orgs/${encodeURIComponent(org)}/branding`),
    staleTime: 5 * 60_000,
  });

export const joinBrandingQuery = (code: string) =>
  queryOptions({
    queryKey: ['join', code, 'branding'],
    queryFn: async () => {
      try {
        return await api<Branding>(`/join/${encodeURIComponent(code)}/branding`);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
  });

/** The institution's accent on the page while it shows; none afterwards. */
export function useOrgAccent(accent: string | null | undefined) {
  useEffect(() => {
    if (!accent) return;
    const root = document.documentElement;
    root.style.setProperty('--org-accent', accent);
    root.dataset.orgAccent = '';
    return () => {
      root.style.removeProperty('--org-accent');
      delete root.dataset.orgAccent;
    };
  }, [accent]);
}

export function useBrandingChanges(org: string) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: brandingQuery(org).queryKey });
  const base = `/orgs/${encodeURIComponent(org)}`;
  return {
    save: useMutation({
      mutationFn: (values: { name: string; accent: string | null }) =>
        api<Branding>(`${base}/branding`, { method: 'PUT', body: values }),
      onSuccess: refresh,
    }),
    upload: useMutation({
      mutationFn: async (file: File) => {
        const res = await fetch(`/api${base}/logo`, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!res.ok) throw new ApiError(res.status, res.status === 413 ? 'invalid_request' : 'internal');
      },
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: () => api<void>(`${base}/logo`, { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  };
}

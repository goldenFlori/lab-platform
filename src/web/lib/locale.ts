import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import type { Me } from '../../shared/auth';
import { DEFAULT_LOCALE, type Locale } from '../../shared/locale';
import { setLocale, storedLocale, storeLocale } from '../i18n';
import { api } from './api';
import { meQuery, useMe } from './auth';
import { courseQuery } from './courses';

// Which language the interface speaks (#19): the user's own choice (kept with the account, or on
// this device when signed out), else the language of the course being viewed, else Albanian.

/** Keeps the interface language in step with the user, the device and the course on screen. */
export function useLocaleSync() {
  const me = useMe();
  const router = useRouter();
  const params = useRouterState({ select: (state) => state.matches.at(-1)?.params as Record<string, string> });
  const org = params?.org;
  const courseId = params?.courseId;
  // Already in the cache: the course's own pages load it before they show.
  const course = useQuery({ ...courseQuery(org ?? '', courseId ?? ''), enabled: Boolean(me && org && courseId) });
  const wanted: Locale = me?.user.locale ?? storedLocale() ?? course.data?.course.locale ?? DEFAULT_LOCALE;

  useEffect(() => {
    // Page titles are made by the routes; make them again in the new language.
    if (setLocale(wanted)) void router.invalidate();
  }, [wanted, router]);
}

/** Switches the language now, remembers it on this device and, when signed in, with the account. */
export function useChooseLocale() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const me = useMe();
  const save = useMutation({
    mutationFn: (locale: Locale) => api<Me>('/me', { method: 'PATCH', body: { locale } }),
    onSuccess: (updated) => queryClient.setQueryData(meQuery.queryKey, updated),
  });
  return (locale: Locale) => {
    storeLocale(locale);
    if (me) {
      const next: Me = { ...me, user: { ...me.user, locale } };
      queryClient.setQueryData(meQuery.queryKey, next);
      save.mutate(locale);
    }
    if (setLocale(locale)) void router.invalidate();
  };
}

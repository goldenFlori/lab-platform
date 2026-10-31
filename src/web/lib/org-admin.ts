import { infiniteQueryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { OrgPeoplePage, OrgSettings } from '../../shared/org-admin';
import type { OrgRole } from '../../shared/org-roles';
import { hashPassword } from '../../shared/password';
import { generateStudentPassword } from '../../shared/student-names';
import { api } from './api';
import { brandingQuery } from './branding';
import type { Slip } from './students';

// The institution admin's page (#202): its people a page at a time, staff accounts with a role across
// the institution (the password made and hashed here, the slip its only copy), and its settings.

const base = (org: string) => `/orgs/${encodeURIComponent(org)}/admin`;

export const peopleQuery = (org: string, query: string) =>
  infiniteQueryOptions({
    queryKey: ['orgs', org, 'admin', 'people', query],
    queryFn: ({ pageParam }) =>
      api<OrgPeoplePage>(`${base(org)}/people?q=${encodeURIComponent(query)}&after=${encodeURIComponent(pageParam)}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.next ?? undefined,
  });

export function useOrgAdminChanges(org: string) {
  const queryClient = useQueryClient();
  const refreshPeople = () => queryClient.invalidateQueries({ queryKey: ['orgs', org, 'admin', 'people'] });
  return {
    addStaff: useMutation({
      mutationFn: async (input: { fullName: string; username: string; role: OrgRole }): Promise<Slip> => {
        const password = generateStudentPassword();
        await api(`${base(org)}/people`, {
          method: 'POST',
          body: { ...input, passwordHash: await hashPassword(password) },
        });
        return { fullName: input.fullName, username: input.username, password };
      },
      onSuccess: refreshPeople,
    }),
    setRole: useMutation({
      mutationFn: ({ userId, role }: { userId: string; role: OrgRole | null }) =>
        api<void>(`${base(org)}/people/${encodeURIComponent(userId)}/role`, { method: 'PUT', body: { role } }),
      onSuccess: refreshPeople,
    }),
    settings: useMutation({
      mutationFn: (settings: OrgSettings) => api<void>(`${base(org)}/settings`, { method: 'PUT', body: settings }),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: brandingQuery(org).queryKey }),
    }),
  };
}

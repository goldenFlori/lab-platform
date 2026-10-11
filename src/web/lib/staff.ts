import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { hashPassword } from '../../shared/password';
import type { StaffMember, StaffRole } from '../../shared/staff';
import { generateStudentPassword, usernameBase } from '../../shared/student-names';
import { api } from './api';
import type { Slip } from './students';

// A course's teaching staff (#64): who teaches it, adding and removing pedagogs and assistants.

const staffPath = (org: string, courseId: string) =>
  `/orgs/${encodeURIComponent(org)}/courses/${encodeURIComponent(courseId)}/staff`;

export const staffQuery = (org: string, courseId: string) =>
  queryOptions({
    queryKey: ['orgs', org, 'courses', courseId, 'staff'],
    queryFn: () => api<StaffMember[]>(staffPath(org, courseId)),
  });

type Scope = { role: StaffRole; groupId: string | null };

export function useStaffChanges(org: string, courseId: string) {
  const queryClient = useQueryClient();
  const keep = (staff: StaffMember[]) => queryClient.setQueryData(staffQuery(org, courseId).queryKey, staff);
  return {
    add: useMutation({
      mutationFn: (body: Scope & { username: string }) =>
        api<StaffMember[]>(staffPath(org, courseId), { method: 'POST', body }),
      onSuccess: keep,
    }),
    /** A new account: its password is made and hashed here, and shown once on the slip. */
    create: useMutation({
      mutationFn: async ({ fullName, ...scope }: Scope & { fullName: string }): Promise<Slip> => {
        const password = generateStudentPassword();
        const { user, staff } = await api<{ user: { fullName: string; username: string }; staff: StaffMember[] }>(
          `${staffPath(org, courseId)}/new`,
          {
            method: 'POST',
            body: { fullName, username: usernameBase(fullName), passwordHash: await hashPassword(password), ...scope },
          },
        );
        keep(staff);
        return { fullName: user.fullName, username: user.username, password };
      },
    }),
    remove: useMutation({
      mutationFn: (membershipId: string) =>
        api<void>(`${staffPath(org, courseId)}/${encodeURIComponent(membershipId)}`, { method: 'DELETE' }),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: staffQuery(org, courseId).queryKey }),
    }),
  };
}

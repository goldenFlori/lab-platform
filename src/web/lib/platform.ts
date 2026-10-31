import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { hashPassword } from '../../shared/password';
import type { Institution } from '../../shared/platform';
import { generateStudentPassword } from '../../shared/student-names';
import { api } from './api';
import type { Slip } from './students';

// The platform owner's console (#200): every institution with its counts, and a new one with its first
// admin, whose password is made and hashed here: the slip is the only copy, as for students.

export const institutionsQuery = queryOptions({
  queryKey: ['platform', 'institutions'],
  queryFn: () => api<{ institutions: Institution[] }>('/platform/institutions'),
});

/** An institution's address from its name: "Fakulteti i Shkencave" → "fakulteti-i-shkencave". */
export function slugOf(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function useCreateInstitution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; slug: string; fullName: string; username: string }): Promise<Slip> => {
      const password = generateStudentPassword();
      await api('/platform/institutions', {
        method: 'POST',
        body: {
          name: input.name,
          slug: input.slug,
          admin: { fullName: input.fullName, username: input.username, passwordHash: await hashPassword(password) },
        },
      });
      return { fullName: input.fullName, username: input.username, password };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: institutionsQuery.queryKey }),
  });
}

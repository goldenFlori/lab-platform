import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, Me } from '../../shared/auth';
import { ApiError, api } from './api';

/** The signed-in user, or null. Pages that need a user check it before they load. */
export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async (): Promise<Me | null> => {
    try {
      return await api<Me>('/me');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  staleTime: 5 * 60 * 1000,
});

export function useMe() {
  return useQuery(meQuery).data ?? null;
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api<Me>('/auth/login', { method: 'POST', body: input }),
    onSuccess: (me) => queryClient.setQueryData(meQuery.queryKey, me),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    // Whatever the server said, this browser is signed out: forget everything cached for the user.
    // (clear() would drop the user without telling the components that show it.)
    onSettled: () => {
      queryClient.setQueryData(meQuery.queryKey, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== meQuery.queryKey[0] });
    },
  });
}

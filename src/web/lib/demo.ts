import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { DEMO_SLUG, type DemoRole, type DemoStatus } from '../../shared/demo';
import { api } from './api';
import { meQuery } from './auth';

// Trying the platform (#216): whether the demo institution is there, and signing in to its shared
// student or pedagog account, which opens the demo course.

export const demoStatusQuery = queryOptions({
  queryKey: ['demo'],
  queryFn: () => api<DemoStatus>('/demo'),
  staleTime: 5 * 60_000,
});

export function useTryDemo() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (role: DemoRole) => api<{ courseId: string }>(`/demo/${role}`, { method: 'POST' }),
    onSuccess: async ({ courseId }) => {
      await queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
      await navigate({ to: '/o/$org/courses/$courseId', params: { org: DEMO_SLUG, courseId } });
    },
  });
}

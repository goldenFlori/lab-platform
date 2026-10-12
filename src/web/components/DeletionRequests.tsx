import { Button } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import type { DeletionRequestView } from '../../shared/my-data';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { formatMoment } from '../lib/labs';

// Users' requests to delete their data (#100), for an institution's admins on their courses page.
// Shown only when there are any.

export function DeletionRequests({ org }: { org: string }) {
  const t = useT();
  const queryClient = useQueryClient();
  const path = `/orgs/${encodeURIComponent(org)}/deletion-requests`;
  const queryKey = ['orgs', org, 'deletion-requests'];
  const { data } = useQuery({ queryKey, queryFn: () => api<DeletionRequestView[]>(path), retry: false });
  const handle = useMutation({
    mutationFn: (id: string) => api<void>(`${path}/${encodeURIComponent(id)}/handled`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  if (!data?.length) return null;
  const open = data.filter((r) => !r.handledAt).length;
  return (
    <details
      open={open > 0}
      className="mt-8 rounded-2xl border border-border bg-surface"
      data-testid="deletion-requests"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <ShieldAlert className="size-4 text-warning" aria-hidden="true" /> {t.deletions.title(open)}
      </summary>
      <div className="border-t border-border p-4">
        <p className="text-sm text-muted">{t.deletions.help}</p>
        <ul className="mt-3 divide-y divide-separator">
          {data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {r.name} <span className="font-normal text-muted">· {r.username}</span>
                </p>
                <p className="text-xs text-muted">
                  {r.handledAt
                    ? t.deletions.handled(formatMoment(r.handledAt))
                    : t.deletions.asked(formatMoment(r.createdAt))}
                </p>
                {r.note && <p className="mt-1">{r.note}</p>}
              </div>
              {!r.handledAt && (
                <Button size="sm" variant="secondary" onPress={() => handle.mutate(r.id)} isPending={handle.isPending}>
                  {t.deletions.markHandled}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

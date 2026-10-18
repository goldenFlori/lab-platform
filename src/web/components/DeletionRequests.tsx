import { Alert, AlertDialog, Button } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ShieldAlert, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { DeletionRequestView, EraseResult, ErasureView, PersonGrade } from '../../shared/my-data';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { downloadCsv } from '../lib/csv';
import { formatMoment } from '../lib/labs';

// Users' requests to delete their data (#100), for an institution's admins on their courses page:
// erase the person's data here (#115), after downloading their released grades for the records, or
// mark the request handled. Shown only when there are requests or erasures.

export function DeletionRequests({ org }: { org: string }) {
  const t = useT();
  const queryClient = useQueryClient();
  const base = `/orgs/${encodeURIComponent(org)}`;
  const path = `${base}/deletion-requests`;
  const queryKey = ['orgs', org, 'deletion-requests'];
  const erasuresKey = ['orgs', org, 'erasures'];
  const { data } = useQuery({ queryKey, queryFn: () => api<DeletionRequestView[]>(path), retry: false });
  const erasures = useQuery({
    queryKey: erasuresKey,
    queryFn: () => api<ErasureView[]>(`${base}/erasures`),
    retry: false,
  });
  const [result, setResult] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const handle = useMutation({
    mutationFn: (id: string) => api<void>(`${path}/${encodeURIComponent(id)}/handled`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const erase = useMutation({
    mutationFn: (id: string) => api<EraseResult>(`${path}/${encodeURIComponent(id)}/erase`, { method: 'POST' }),
    onSuccess: (done) => setResult({ tone: 'success', text: t.deletions.erased(done.accountDeleted) }),
    onError: () => setResult({ tone: 'danger', text: t.deletions.eraseFailed }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: erasuresKey });
    },
  });
  const done = erasures.data ?? [];
  if (!data?.length && !done.length) return null;
  const open = (data ?? []).filter((r) => !r.handledAt).length;
  return (
    <details
      open={open > 0 || result !== null}
      className="mt-8 rounded-2xl border border-border bg-surface"
      data-testid="deletion-requests"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <ShieldAlert className="size-4 text-warning" aria-hidden="true" /> {t.deletions.title(open)}
      </summary>
      <div className="border-t border-border p-4">
        <p className="text-sm text-muted">{t.deletions.help}</p>
        {result && (
          <Alert status={result.tone} className="mt-3">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{result.text}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        <ul className="mt-3 divide-y divide-separator">
          {(data ?? []).map((r) => (
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
                <div className="flex flex-wrap gap-2">
                  <EraseButton
                    request={r}
                    gradesPath={`${path}/${encodeURIComponent(r.id)}/grades`}
                    isPending={erase.isPending}
                    onErase={() => {
                      setResult(null);
                      erase.mutate(r.id);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => handle.mutate(r.id)}
                    isPending={handle.isPending}
                  >
                    {t.deletions.markHandled}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {done.length > 0 && (
          <div className="mt-4" data-testid="erasures">
            <p className="text-sm font-semibold">{t.deletions.erasures}</p>
            <ul className="mt-1 grid gap-1 text-xs text-muted">
              {done.map((e) => (
                <li key={e.id}>
                  {t.deletions.erasure(formatMoment(e.requestedAt), formatMoment(e.erasedAt))}
                  {e.by && ` ${t.deletions.erasedBy(e.by)}`}
                  {e.accountDeleted && ` · ${t.deletions.accountGone}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

function EraseButton({
  request,
  gradesPath,
  isPending,
  onErase,
}: {
  request: DeletionRequestView;
  gradesPath: string;
  isPending: boolean;
  onErase: () => void;
}) {
  const t = useT();
  return (
    <AlertDialog>
      <Button size="sm" variant="danger-soft" isPending={isPending}>
        <Trash2 className="size-4" /> {t.deletions.erase}
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>{t.deletions.eraseTitle(request.name)}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>{t.deletions.eraseText}</p>
              <p className="mt-2 text-sm text-muted">{t.deletions.eraseKeep}</p>
              <GradesFirst request={request} path={gradesPath} />
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                {t.common.cancel}
              </Button>
              <Button slot="close" variant="danger" onPress={onErase}>
                {t.deletions.eraseConfirm}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

/** The person's released grades, loaded when the dialog opens, to download before they go. */
function GradesFirst({ request, path }: { request: DeletionRequestView; path: string }) {
  const t = useT();
  const { data } = useQuery({
    queryKey: ['deletion-grades', path],
    queryFn: () => api<{ grades: PersonGrade[] }>(path),
    staleTime: 0,
  });
  if (!data) return null;
  if (!data.grades.length) return <p className="mt-3 text-sm">{t.deletions.noGrades}</p>;

  function download() {
    const c = t.grading.csvColumns;
    const d = t.deletions.csv;
    downloadCsv(t.grading.csvFile(request.username), [
      [c.username, c.fullName, d.course, d.lab, d.notebook, c.score, c.maxScore, d.releasedAt],
      ...(data?.grades ?? []).map((g) => [
        request.username,
        request.name,
        g.course,
        g.lab,
        g.notebook,
        g.score,
        g.maxScore,
        new Date(g.releasedAt).toLocaleDateString('sv-SE'),
      ]),
    ]);
  }

  return (
    <div className="mt-3 rounded-xl bg-surface-secondary p-3 text-sm">
      <p>{t.deletions.gradesFirst(data.grades.length)}</p>
      <Button size="sm" variant="secondary" className="mt-2" onPress={download}>
        <Download className="size-4" /> {t.deletions.downloadGrades}
      </Button>
    </div>
  );
}

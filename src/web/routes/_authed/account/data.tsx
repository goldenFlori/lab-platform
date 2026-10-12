import { Alert, Button } from '@heroui/react';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Download, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { t as messages, useT } from '../../../i18n';
import { api } from '../../../lib/api';
import { APP_NAME } from '../../../lib/brand';

// "My data" (#100): every user downloads what is kept about them, and asks their institutions to
// delete it. The download is built by the server from the signed-in account only.

export const Route = createFileRoute('/_authed/account/data')({
  head: () => ({ meta: [{ title: `${messages().myData.title} · ${APP_NAME}` }] }),
  component: MyDataPage,
});

function MyDataPage() {
  const t = useT();
  const [note, setNote] = useState('');
  const request = useMutation({
    mutationFn: () => api<void>('/me/deletion-request', { method: 'POST', body: { note: note.trim() || undefined } }),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    request.mutate();
  };
  return (
    <section className="container-page max-w-3xl py-12">
      <h1 className="text-3xl font-bold tracking-tight">{t.myData.title}</h1>
      <p className="mt-1 text-muted">{t.myData.lead}</p>

      <div className="mt-8 rounded-2xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Download className="size-4 text-accent" aria-hidden="true" /> {t.myData.downloadTitle}
        </h2>
        <p className="mt-1 text-sm text-muted">{t.myData.downloadText}</p>
        <a href="/api/me/data" download className="button button--primary mt-4 gap-2">
          <Download className="size-4" /> {t.myData.download}
        </a>
      </div>

      <form onSubmit={submit} className="mt-6 rounded-2xl border border-border bg-surface p-5" data-testid="deletion">
        <h2 className="flex items-center gap-2 font-semibold">
          <Trash2 className="size-4 text-danger" aria-hidden="true" /> {t.myData.deleteTitle}
        </h2>
        <p className="mt-1 text-sm text-muted">{t.myData.deleteText}</p>
        {request.isSuccess ? (
          <Alert status="success" className="mt-4">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{t.myData.sent}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : (
          <>
            <label className="mt-4 grid gap-1 text-sm">
              <span className="font-medium">{t.myData.note}</span>
              <textarea
                value={note}
                maxLength={500}
                rows={2}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2"
              />
            </label>
            {request.isError && <p className="mt-2 text-sm text-danger">{t.myData.failed}</p>}
            <Button type="submit" variant="danger-soft" className="mt-4" isPending={request.isPending}>
              {t.myData.request}
            </Button>
          </>
        )}
      </form>

      <Link to="/privacy" className="mt-6 inline-block text-sm text-accent hover:underline">
        {t.myData.privacy}
      </Link>
    </section>
  );
}

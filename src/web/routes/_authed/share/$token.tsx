import { Alert, Button } from '@heroui/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, BookOpen, Copy } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { SharePreview } from '../../../../shared/sharing';
import { t as messages, useT } from '../../../i18n';
import { APP_NAME } from '../../../lib/brand';
import { currentAcademicYear } from '../../../lib/courses';
import { sharePreviewQuery, useCopyShare } from '../../../lib/sharing';

// The page a share link opens (#203): what the shared course brings, and a copy of it as a new course
// in one of the viewer's institutions. Signed-out visitors sign in first and come back here.

export const Route = createFileRoute('/_authed/share/$token')({
  loader: ({ context: { queryClient }, params: { token } }) => queryClient.ensureQueryData(sharePreviewQuery(token)),
  head: () => ({ meta: [{ title: `${messages().sharing.pageTitle} · ${APP_NAME}` }] }),
  component: SharePage,
});

function SharePage() {
  const { token } = Route.useParams();
  const t = useT();
  const { data: preview } = useSuspenseQuery(sharePreviewQuery(token));
  return (
    <section className="container-page py-10">
      <Link to="/courses" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> {t.courses.title}
      </Link>
      {preview ? (
        <ShareCopy token={token} preview={preview} />
      ) : (
        <>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">{t.sharing.pageTitle}</h1>
          <Alert status="warning" className="mt-6 max-w-2xl">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{t.sharing.unavailable}</Alert.Description>
            </Alert.Content>
          </Alert>
        </>
      )}
    </section>
  );
}

function ShareCopy({ token, preview }: { token: string; preview: SharePreview }) {
  const t = useT();
  const copy = useCopyShare();
  const navigate = useNavigate();
  const [org, setOrg] = useState(preview.destinations[0]?.slug ?? '');
  const [title, setTitle] = useState(preview.title);
  const [year, setYear] = useState(currentAcademicYear());
  const yearOk = /^\d{4}\/\d{2}$/.test(year.trim());
  const field = 'h-10 rounded-xl border border-border bg-surface px-3';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!yearOk) return;
    try {
      const course = await copy.mutateAsync({ org, token, title: title.trim(), academicYear: year.trim() });
      await navigate({ to: '/o/$org/courses/$courseId', params: { org, courseId: course.id } });
    } catch {
      // Shown below from the mutation's state.
    }
  }

  return (
    <>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{t.sharing.heading(preview.title)}</h1>
      <p className="mt-1 text-muted">{t.sharing.from(preview.institution, preview.academicYear)}</p>

      <section aria-labelledby="share-contents" className="mt-8 max-w-2xl">
        <h2 id="share-contents" className="text-lg font-semibold tracking-tight">
          {t.sharing.contents}
        </h2>
        <ul className="mt-3 divide-y divide-separator rounded-2xl border border-border bg-surface">
          {preview.labs.map((lab, i) => (
            // Lab titles may repeat; their order is the course's.
            // biome-ignore lint/suspicious/noArrayIndexKey: the list never reorders
            <li key={i} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <BookOpen className="size-4 text-muted" aria-hidden="true" /> {lab.title}
              </span>
              <span className="text-muted">{t.sharing.notebooks(lab.notebooks)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm">{preview.solutions ? t.sharing.withSolutions : t.sharing.withoutSolutions}</p>
        <p className="mt-1 text-sm text-muted">{t.sharing.never}</p>
      </section>

      <form
        onSubmit={(e) => void submit(e)}
        aria-labelledby="share-copy"
        className="mt-8 grid max-w-2xl gap-4 rounded-3xl border border-border bg-surface p-5 shadow-surface sm:grid-cols-2 sm:p-7"
      >
        <h2 id="share-copy" className="text-lg font-semibold tracking-tight sm:col-span-2">
          {t.sharing.submit}
        </h2>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="font-medium">{t.sharing.institution}</span>
          <select value={org} onChange={(e) => setOrg(e.target.value)} className={field}>
            {preview.destinations.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t.sharing.courseTitle}</span>
          <input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t.sharing.year}</span>
          <input
            required
            value={year}
            onChange={(e) => setYear(e.target.value)}
            aria-invalid={!yearOk}
            aria-describedby="share-year-help"
            className={field}
          />
          <span id="share-year-help" className={`text-xs ${yearOk ? 'text-muted' : 'text-danger'}`}>
            {t.sharing.yearFormat}
          </span>
        </label>
        <p className="text-xs text-muted sm:col-span-2">{t.sharing.seen(preview.institution)}</p>
        {copy.isError && (
          <p role="alert" className="text-sm text-danger sm:col-span-2">
            {t.sharing.copyFailed}
          </p>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary" isPending={copy.isPending} isDisabled={!yearOk}>
            <Copy className="size-4" /> {t.sharing.submit}
          </Button>
        </div>
      </form>
    </>
  );
}

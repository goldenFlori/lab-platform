import { Button } from '@heroui/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ArrowLeft, Check, CircleAlert, ImageUp, Trash2 } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { accentContrast, isLogoType, LOGO_BYTES } from '../../../../../shared/branding';
import { t as messages, useT } from '../../../../i18n';
import { ApiError } from '../../../../lib/api';
import { APP_NAME } from '../../../../lib/brand';
import { brandingQuery, useBrandingChanges } from '../../../../lib/branding';
import { orgAccessQuery } from '../../../../lib/courses';

// The institution admin's page (#201, #202): for those with org.manage, starting with its look (name,
// accent, logo). Anyone else meets the page that does not exist, as the API answers them.

export const Route = createFileRoute('/_authed/o/$org/admin')({
  loader: async ({ context: { queryClient }, params: { org } }) => {
    const access = await queryClient.ensureQueryData(orgAccessQuery(org)).catch(() => null);
    if (!access?.capabilities.organization.includes('org.manage')) throw notFound();
    await queryClient.ensureQueryData(brandingQuery(org));
  },
  head: () => ({ meta: [{ title: `${messages().orgAdmin.pageTitle} · ${APP_NAME}` }] }),
  component: OrgAdminPage,
});

function OrgAdminPage() {
  const { org } = Route.useParams();
  const t = useT();
  const { data: branding } = useSuspenseQuery(brandingQuery(org));
  return (
    <section className="container-page py-10">
      <Link to="/courses" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> {t.courses.title}
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{t.orgAdmin.title(branding.name)}</h1>
      <BrandingSection org={org} />
    </section>
  );
}

function BrandingSection({ org }: { org: string }) {
  const t = useT();
  const { data: branding } = useSuspenseQuery(brandingQuery(org));
  const changes = useBrandingChanges(org);
  const [name, setName] = useState(branding.name);
  const [accent, setAccent] = useState<string | null>(branding.accent);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const ratio = accent ? accentContrast(accent) : null;
  const readable = ratio === null || ratio >= 4.5;

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      await changes.save.mutateAsync({ name: name.trim(), accent });
      setMessage({ tone: 'success', text: t.branding.saved });
    } catch {
      setMessage({ tone: 'danger', text: t.branding.failed });
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage(null);
    if (!isLogoType(file.type)) return setMessage({ tone: 'danger', text: t.branding.logoType });
    if (file.size > LOGO_BYTES) return setMessage({ tone: 'danger', text: t.branding.logoTooBig });
    try {
      await changes.upload.mutateAsync(file);
      setMessage({ tone: 'success', text: t.branding.saved });
    } catch (error) {
      const tooBig = error instanceof ApiError && error.status === 413;
      setMessage({ tone: 'danger', text: tooBig ? t.branding.logoTooBig : t.branding.failed });
    }
  }

  const field = 'h-10 rounded-xl border border-border bg-surface px-3';
  return (
    <section
      aria-labelledby="branding"
      className="mt-8 max-w-2xl rounded-3xl border border-border bg-surface p-5 shadow-surface sm:p-7"
    >
      <h2 id="branding" className="text-lg font-semibold tracking-tight">
        {t.branding.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{t.branding.help}</p>

      <form onSubmit={(e) => void save(e)} className="mt-5 grid gap-5">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t.branding.name}</span>
          <input
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
          />
        </label>

        <fieldset className="grid gap-2 text-sm">
          <legend className="font-medium">{t.branding.accent}</legend>
          <p id="accent-help" className="text-xs text-muted">
            {t.branding.accentHelp}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="color"
              aria-label={t.branding.accent}
              aria-describedby="accent-help accent-verdict"
              value={accent ?? '#0064dc'}
              onChange={(e) => setAccent(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-surface p-1"
            />
            <code className="text-sm">{accent ?? '—'}</code>
            {accent && (
              <Button size="sm" variant="ghost" onPress={() => setAccent(null)}>
                {t.branding.noAccent}
              </Button>
            )}
            {/* The colour as the app would use it: white text on it. */}
            <span
              className="rounded-full px-3 py-1.5 text-sm font-medium"
              // An institution's colour is checked against white; the platform's comes with its own text colour.
              style={
                accent
                  ? { background: accent, color: '#ffffff' }
                  : { background: 'var(--accent)', color: 'var(--accent-foreground)' }
              }
              aria-hidden="true"
            >
              {t.branding.preview}
            </span>
          </div>
          {ratio !== null && (
            <p
              id="accent-verdict"
              className={`flex items-center gap-1.5 text-sm ${readable ? 'text-success' : 'text-danger'}`}
              data-testid="accent-verdict"
            >
              {readable ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <CircleAlert className="size-4" aria-hidden="true" />
              )}
              {readable ? t.branding.readable(ratio.toFixed(1)) : t.branding.unreadable(ratio.toFixed(1))}
            </p>
          )}
        </fieldset>

        <div>
          <Button type="submit" variant="primary" isDisabled={!readable} isPending={changes.save.isPending}>
            {t.branding.save}
          </Button>
        </div>
      </form>

      <div className="mt-6 border-t border-separator pt-5">
        <p className="text-sm font-medium">{t.branding.logo}</p>
        <p className="text-xs text-muted">{t.branding.logoHelp}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {branding.logo && (
            <img
              src={branding.logo}
              alt={t.branding.logoAlt(branding.name)}
              className="h-12 max-w-40 rounded-lg border border-border bg-white object-contain p-1"
            />
          )}
          <label className="button button--secondary button--sm cursor-pointer gap-2">
            <ImageUp className="size-4" aria-hidden="true" /> {t.branding.upload}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              onChange={(e) => void upload(e)}
            />
          </label>
          {branding.logo && (
            <Button
              size="sm"
              variant="ghost"
              isPending={changes.remove.isPending}
              onPress={() => changes.remove.mutate()}
            >
              <Trash2 className="size-4" /> {t.branding.remove}
            </Button>
          )}
        </div>
      </div>

      {message && (
        <p
          role={message.tone === 'danger' ? 'alert' : 'status'}
          className={`mt-4 text-sm ${message.tone === 'danger' ? 'text-danger' : 'text-success'}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}

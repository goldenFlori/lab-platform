import { Alert, Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { Building2, Printer } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { usernameBase } from '../../../shared/student-names';
import { CredentialSlips } from '../../components/CredentialSlips';
import { ScrollRegion } from '../../components/ScrollRegion';
import { t as messages, useT } from '../../i18n';
import { ApiError } from '../../lib/api';
import { APP_NAME } from '../../lib/brand';
import { formatMoment } from '../../lib/labs';
import { institutionsQuery, slugOf, useCreateInstitution } from '../../lib/platform';
import type { Slip } from '../../lib/students';

// The platform owner's console (#200): every institution with its counts, and a new institution with
// its first admin. Anyone else meets the page that does not exist, as the API answers them.

export const Route = createFileRoute('/_authed/platform')({
  beforeLoad: ({ context }) => {
    if (!context.me.owner) throw notFound();
  },
  head: () => ({ meta: [{ title: `${messages().platform.pageTitle} · ${APP_NAME}` }] }),
  component: PlatformPage,
});

function PlatformPage() {
  const t = useT();
  const query = useQuery(institutionsQuery);
  const create = useCreateInstitution();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ institution: string; slip: Slip } | null>(null);
  // Suggested from the names until typed over.
  const address = slug ?? slugOf(name);
  const login = username ?? (fullName ? usernameBase(fullName) : '');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const slip = await create.mutateAsync({
        name: name.trim(),
        slug: address,
        fullName: fullName.trim(),
        username: login,
      });
      setMade({ institution: name.trim(), slip });
      setName('');
      setSlug(null);
      setFullName('');
      setUsername(null);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : null;
      setError(
        code === 'slug_taken'
          ? t.platform.slugTaken
          : code === 'username_taken'
            ? t.platform.usernameTaken
            : t.platform.failed,
      );
    }
  }

  const field = 'h-10 rounded-xl border border-border bg-surface px-3';
  return (
    <section className="container-page py-10">
      <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
        <Building2 className="size-7 text-accent" aria-hidden="true" /> {t.platform.title}
      </h1>
      <p className="mt-1 max-w-2xl text-muted">{t.platform.lead}</p>

      {query.isError ? (
        <Alert status="danger" className="mt-6">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t.platform.loadFailed}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : !query.data ? (
        <p className="mt-6 text-sm text-muted" aria-busy="true">
          {t.common.loading}
        </p>
      ) : query.data.institutions.length === 0 ? (
        <p className="mt-6 text-sm text-muted">{t.platform.none}</p>
      ) : (
        <ScrollRegion label={t.platform.title} className="mt-6">
          <table className="w-full min-w-xl text-left text-sm" data-testid="institutions">
            <thead className="text-xs text-muted">
              <tr className="border-b border-separator">
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t.platform.name}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t.platform.courses}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t.platform.staff}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t.platform.students}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t.platform.active}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t.platform.since}
                </th>
              </tr>
            </thead>
            <tbody>
              {query.data.institutions.map((i) => (
                <tr key={i.id} className="border-b border-separator/60 last:border-0">
                  <th scope="row" className="py-2 pr-4 font-medium">
                    {i.name} <span className="font-normal text-muted">/o/{i.slug}</span>
                  </th>
                  <td className="py-2 pr-4 tabular-nums">{i.courses}</td>
                  <td className="py-2 pr-4 tabular-nums">{i.staff}</td>
                  <td className="py-2 pr-4 tabular-nums">{i.students}</td>
                  <td className="py-2 pr-4 tabular-nums">{i.activeThisWeek}</td>
                  <td className="py-2 text-muted">{formatMoment(i.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}

      <form
        onSubmit={(e) => void submit(e)}
        aria-labelledby="new-institution"
        className="mt-10 max-w-2xl rounded-3xl border border-border bg-surface p-5 shadow-surface sm:p-7"
      >
        <h2 id="new-institution" className="text-lg font-semibold tracking-tight">
          {t.platform.newTitle}
        </h2>
        <p className="mt-1 text-sm text-muted">{t.platform.newHelp}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium">{t.platform.institutionName}</span>
            <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium">{t.platform.slug}</span>
            <input
              required
              pattern="[a-z0-9\-]{2,40}"
              value={address}
              onChange={(e) => setSlug(e.target.value)}
              aria-describedby="slug-help"
              className={`${field} font-mono`}
            />
            <span id="slug-help" className="text-xs text-muted">
              {t.platform.slugHelp(address)}
            </span>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{t.platform.adminName}</span>
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={field} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{t.platform.adminUsername}</span>
            <input
              required
              pattern="[a-z][a-z0-9.]{1,39}"
              value={login}
              onChange={(e) => setUsername(e.target.value)}
              className={`${field} font-mono`}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="mt-4" isPending={create.isPending}>
          {t.platform.create}
        </Button>
      </form>

      {made && (
        <section className="mt-8 max-w-2xl" aria-live="polite">
          <p role="status" className="text-sm text-success">
            {t.platform.created(made.institution)}
          </p>
          <div className="mt-4">
            <CredentialSlips slips={[made.slip]} courseTitle={made.institution} groupName={t.platform.adminRole} />
          </div>
          <Button variant="secondary" className="mt-4" onPress={() => window.print()}>
            <Printer className="size-4" /> {t.platform.print}
          </Button>
        </section>
      )}
    </section>
  );
}

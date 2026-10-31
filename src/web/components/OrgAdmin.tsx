import { Button, Label, Switch } from '@heroui/react';
import { useInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Printer, Search } from 'lucide-react';
import { type FormEvent, useDeferredValue, useState } from 'react';
import { LOCALES } from '../../shared/locale';
import { ORG_ROLES, type OrgRole } from '../../shared/org-roles';
import { usernameBase } from '../../shared/student-names';
import { LANGUAGE_NAMES, useT } from '../i18n';
import { ApiError } from '../lib/api';
import { useMe } from '../lib/auth';
import { brandingQuery } from '../lib/branding';
import { peopleQuery, useOrgAdminChanges } from '../lib/org-admin';
import type { Slip } from '../lib/students';
import { CredentialSlips } from './CredentialSlips';
import { ScrollRegion } from './ScrollRegion';

// The institution admin's page (#202): its language and AI policy, and its people with their roles
// across the institution, with new staff accounts.

const card = 'mt-8 rounded-3xl border border-border bg-surface p-5 shadow-surface sm:p-7';
const field = 'h-10 rounded-xl border border-border bg-surface px-3';

export function OrgSettingsSection({ org }: { org: string }) {
  const t = useT();
  const { data: branding } = useSuspenseQuery(brandingQuery(org));
  const changes = useOrgAdminChanges(org);
  const [locale, setLocale] = useState(branding.locale);
  const [aiAllowed, setAiAllowed] = useState(branding.aiAllowed);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      await changes.settings.mutateAsync({ locale, aiAllowed });
      setMessage({ tone: 'success', text: t.orgSettings.saved });
    } catch {
      setMessage({ tone: 'danger', text: t.orgSettings.failed });
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} aria-labelledby="org-settings" className={`${card} max-w-2xl`}>
      <h2 id="org-settings" className="text-lg font-semibold tracking-tight">
        {t.orgSettings.title}
      </h2>
      <label className="mt-4 grid gap-1 text-sm">
        <span className="font-medium">{t.orgSettings.language}</span>
        <select
          value={locale ?? ''}
          onChange={(e) => setLocale((e.target.value || null) as typeof locale)}
          aria-describedby="org-language-help"
          className={`${field} max-w-xs`}
        >
          <option value="">{t.orgSettings.noLanguage}</option>
          {LOCALES.filter((code) => code !== 'sq').map((code) => (
            <option key={code} value={code} lang={code}>
              {LANGUAGE_NAMES[code]}
            </option>
          ))}
        </select>
        <span id="org-language-help" className="text-xs text-muted">
          {t.orgSettings.languageHelp}
        </span>
      </label>
      <div className="mt-5 grid gap-1">
        <Switch
          isSelected={aiAllowed}
          onChange={setAiAllowed}
          aria-describedby="org-ai-help"
          className="flex-row items-center gap-2"
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Content>
            <Label className="text-sm font-medium">{t.orgSettings.ai}</Label>
          </Switch.Content>
        </Switch>
        <span id="org-ai-help" className="text-xs text-muted">
          {t.orgSettings.aiHelp}
        </span>
      </div>
      <Button type="submit" variant="primary" className="mt-5" isPending={changes.settings.isPending}>
        {t.orgSettings.save}
      </Button>
      {message && (
        <p
          role={message.tone === 'danger' ? 'alert' : 'status'}
          className={`mt-3 text-sm ${message.tone === 'danger' ? 'text-danger' : 'text-success'}`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}

export function OrgPeopleSection({ org, institution }: { org: string; institution: string }) {
  const t = useT();
  const me = useMe();
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search.trim());
  const people = useInfiniteQuery(peopleQuery(org, query));
  const changes = useOrgAdminChanges(org);
  const [error, setError] = useState<string | null>(null);
  const list = people.data?.pages.flatMap((p) => p.people) ?? [];

  async function setRole(userId: string, value: string) {
    setError(null);
    try {
      await changes.setRole.mutateAsync({ userId, role: (value || null) as OrgRole | null });
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'own_account' ? t.orgPeople.ownAccount : t.orgPeople.roleFailed);
    }
  }

  return (
    <section aria-labelledby="org-people" className={card}>
      <h2 id="org-people" className="text-lg font-semibold tracking-tight">
        {t.orgPeople.title}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{t.orgPeople.help}</p>
      <label className="relative mt-4 block max-w-sm">
        <span className="sr-only">{t.orgPeople.search}</span>
        <Search className="absolute top-3 left-3 size-4 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.orgPeople.search}
          className={`${field} w-full pl-9`}
        />
      </label>
      {people.isError ? (
        <p className="mt-4 text-sm text-danger">{t.orgPeople.loadFailed}</p>
      ) : !people.data ? (
        <p className="mt-4 text-sm text-muted" aria-busy="true">
          {t.common.loading}
        </p>
      ) : list.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t.orgPeople.none}</p>
      ) : (
        <ScrollRegion label={t.orgPeople.title} className="mt-4">
          <table className="w-full min-w-xl text-left text-sm" data-testid="org-people">
            <thead className="text-xs text-muted">
              <tr className="border-b border-separator">
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t.orgPeople.person}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t.orgPeople.role}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t.orgPeople.teaches}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t.orgPeople.studies}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const self = p.id === me?.user.id;
                return (
                  <tr key={p.id} className="border-b border-separator/60 last:border-0">
                    <th scope="row" className="py-2 pr-4 font-medium">
                      {p.fullName} {self && <span className="text-xs font-normal text-muted">({t.orgPeople.you})</span>}
                      <span className="block text-xs font-normal text-muted">{p.username}</span>
                    </th>
                    <td className="py-2 pr-4">
                      <select
                        value={p.orgRole ?? ''}
                        disabled={self || changes.setRole.isPending}
                        aria-label={t.orgPeople.roleOf(p.fullName)}
                        onChange={(e) => void setRole(p.id, e.target.value)}
                        className="h-9 rounded-xl border border-border bg-surface px-2"
                      >
                        <option value="">{t.orgPeople.noRole}</option>
                        {ORG_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {t.orgPeople.roles[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-4 text-muted">{p.teaches ? t.orgPeople.inCourses(p.teaches) : '—'}</td>
                    <td className="py-2 text-muted">{p.studies ? t.orgPeople.inGroups(p.studies) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollRegion>
      )}
      <p className="mt-2 text-xs text-muted">{t.orgPeople.leaves}</p>
      {people.hasNextPage && (
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          isPending={people.isFetchingNextPage}
          onPress={() => void people.fetchNextPage()}
        >
          {t.orgPeople.more}
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <AddStaff org={org} institution={institution} />
    </section>
  );
}

function AddStaff({ org, institution }: { org: string; institution: string }) {
  const t = useT();
  const changes = useOrgAdminChanges(org);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<OrgRole>('pedagog');
  const [error, setError] = useState<string | null>(null);
  const [slip, setSlip] = useState<Slip | null>(null);
  const login = username ?? (fullName ? usernameBase(fullName) : '');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      setSlip(await changes.addStaff.mutateAsync({ fullName: fullName.trim(), username: login, role }));
      setFullName('');
      setUsername(null);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'username_taken' ? t.orgPeople.usernameTaken : t.orgPeople.addFailed,
      );
    }
  }

  return (
    <div className="mt-6 border-t border-separator pt-5">
      <form onSubmit={(e) => void submit(e)} aria-labelledby="add-staff" className="max-w-2xl">
        <h3 id="add-staff" className="font-semibold">
          {t.orgPeople.addTitle}
        </h3>
        <p className="mt-1 text-sm text-muted">{t.orgPeople.addHelp}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{t.orgPeople.fullName}</span>
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={field} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{t.orgPeople.username}</span>
            <input
              required
              pattern="[a-z][a-z0-9.]{1,39}"
              value={login}
              onChange={(e) => setUsername(e.target.value)}
              className={`${field} font-mono`}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{t.orgPeople.role}</span>
            <select value={role} onChange={(e) => setRole(e.target.value as OrgRole)} className={field}>
              {ORG_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t.orgPeople.roles[r]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="mt-4" isPending={changes.addStaff.isPending}>
          {t.orgPeople.add}
        </Button>
      </form>
      {slip && (
        <div className="mt-6 max-w-2xl" aria-live="polite">
          <p role="status" className="text-sm text-success">
            {t.orgPeople.added(slip.fullName)}
          </p>
          <div className="mt-4">
            <CredentialSlips slips={[slip]} courseTitle={institution} groupName={t.orgPeople.roles[role]} />
          </div>
          <Button variant="secondary" className="mt-4" onPress={() => window.print()}>
            <Printer className="size-4" /> {t.orgPeople.print}
          </Button>
        </div>
      )}
    </div>
  );
}

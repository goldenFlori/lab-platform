import { Alert, Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { UserPlus, UserRoundCog, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { GroupView } from '../../shared/courses';
import { STAFF_ROLES, type StaffRole } from '../../shared/staff';
import { useT } from '../i18n';
import { ApiError } from '../lib/api';
import { staffQuery, useStaffChanges } from '../lib/staff';

// Who teaches the course (#64): pedagogs and assistants for the whole course or one group, added
// from the institution's accounts or as new accounts, for staff who manage the course.

export function CourseStaff({ org, courseId, groups }: { org: string; courseId: string; groups: GroupView[] }) {
  const t = useT();
  const query = useQuery(staffQuery(org, courseId));
  const changes = useStaffChanges(org, courseId);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger' | 'warning'; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const scopeName = (groupId: string | null) =>
    groupId ? (groups.find((g) => g.id === groupId)?.name ?? '') : t.staff.wholeCourse;

  const scopeOf = (form: FormData) => ({
    role: (String(form.get('role')) as StaffRole) ?? 'assistant',
    groupId: String(form.get('scope') ?? '') || null,
  });

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setNotice(null);
    try {
      await changes.add.mutateAsync({ username: String(form.get('username') ?? '').trim(), ...scopeOf(form) });
      event.currentTarget?.reset();
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setCreating(true);
        return setNotice({ tone: 'warning', text: t.staff.notFound });
      }
      const already = error instanceof ApiError && error.status === 409;
      setNotice({ tone: 'danger', text: already ? t.staff.already : t.staff.addFailed });
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const slip = await changes.create.mutateAsync({
        fullName: String(form.get('fullName') ?? '').trim(),
        ...scopeOf(form),
      });
      setCreating(false);
      setNotice({ tone: 'success', text: t.staff.slip(slip.username, slip.password) });
    } catch {
      setNotice({ tone: 'danger', text: t.staff.addFailed });
    }
  }

  function remove(id: string) {
    setNotice(null);
    changes.remove.mutate(id, {
      onError: (error) =>
        setNotice({
          tone: 'danger',
          text: error instanceof ApiError && error.status === 409 ? t.staff.lastPedagog : t.staff.removeFailed,
        }),
    });
  }

  const field = 'h-10 min-w-0 rounded-xl border border-border bg-surface px-3';
  const roleAndScope = (
    <>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{t.staff.role}</span>
        <select name="role" defaultValue="assistant" className={field}>
          {STAFF_ROLES.map((role) => (
            <option key={role} value={role}>
              {t.staff.roles[role]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{t.staff.scope}</span>
        <select name="scope" defaultValue="" className={field}>
          <option value="">{t.staff.wholeCourse}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );

  return (
    <section aria-labelledby="course-staff" className="mt-10">
      <h2 id="course-staff" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <UserRoundCog className="size-5 text-accent" aria-hidden="true" /> {t.staff.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{t.staff.help}</p>
      <ul className="mt-4 divide-y divide-separator rounded-2xl border border-border bg-surface">
        {(query.data ?? []).map((member) => (
          <li
            key={member.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
            data-testid="staff-member"
          >
            <div className="min-w-0 flex-1 basis-40">
              <p className="truncate font-medium">{member.fullName}</p>
              <p className="truncate text-xs text-muted">{member.username}</p>
            </div>
            <p className="text-sm">
              {t.staff.roles[member.role] ?? member.role} ·{' '}
              <span className="text-muted">{scopeName(member.groupId)}</span>
            </p>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={t.staff.remove(member.fullName)}
              onPress={() => remove(member.id)}
            >
              <X className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      <form
        onSubmit={add}
        aria-label={t.staff.add}
        className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem_12rem_auto] sm:items-end"
      >
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t.staff.username}</span>
          <input name="username" required autoComplete="off" className={field} />
        </label>
        {roleAndScope}
        <Button type="submit" variant="primary" isPending={changes.add.isPending}>
          <UserPlus className="size-4" /> {t.staff.submit}
        </Button>
      </form>

      {creating && (
        <form
          onSubmit={create}
          aria-label={t.staff.create}
          className="mt-3 grid gap-3 rounded-2xl bg-surface-secondary p-3 sm:grid-cols-[1fr_10rem_12rem_auto] sm:items-end"
        >
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{t.staff.fullName}</span>
            <input name="fullName" required maxLength={100} className={field} />
          </label>
          {roleAndScope}
          <Button type="submit" variant="secondary" isPending={changes.create.isPending}>
            {t.staff.createSubmit}
          </Button>
        </form>
      )}

      {notice && (
        <Alert status={notice.tone} className="mt-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{notice.text}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </section>
  );
}

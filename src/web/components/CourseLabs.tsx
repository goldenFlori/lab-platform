import { Alert, AlertDialog, Button, Chip, Label, Switch } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarClock, FlaskConical, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { GroupView } from '../../shared/courses';
import type { LabRule, LabState, LabView } from '../../shared/labs';
import { type Messages, useT } from '../i18n';
import { formatMoment, fromLocalInput, type LabFields, labsQuery, toLocalInput, useLabChanges } from '../lib/labs';

type Props = { org: string; courseId: string; groups: GroupView[] };

const STATE_COLOR: Record<LabState, 'default' | 'accent' | 'success' | 'warning' | 'danger'> = {
  hidden: 'default',
  scheduled: 'warning',
  open: 'success',
  closed: 'default',
};

function stateLabel(t: Messages, state: LabState, rule: LabRule | undefined) {
  if (state === 'scheduled' && rule?.visibleFrom) return t.labs.opensAt(formatMoment(rule.visibleFrom));
  if (state === 'open' && rule?.visibleUntil) return t.labs.openUntil(formatMoment(rule.visibleUntil));
  return t.labs.states[state];
}

function LabLink({
  org,
  courseId,
  lab,
  className,
}: {
  org: string;
  courseId: string;
  lab: LabView;
  className?: string;
}) {
  return (
    <Link
      to="/o/$org/courses/$courseId/labs/$labId"
      params={{ org, courseId, labId: lab.id }}
      className={`rounded-sm ${className ?? ''}`}
    >
      {lab.title}
    </Link>
  );
}

export function CourseLabs({ org, courseId, groups }: Props) {
  const labs = useQuery(labsQuery(org, courseId));
  const t = useT();

  return (
    <div className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">{t.labs.title}</h2>
      {labs.isPending ? (
        <p className="mt-3 text-sm text-muted">{t.common.loading}</p>
      ) : labs.isError ? (
        <Alert status="danger" className="mt-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t.labs.loadFailed}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : labs.data.permissions.staff ? (
        <StaffLabs org={org} courseId={courseId} groups={groups} list={labs.data} />
      ) : (
        <StudentLabs org={org} courseId={courseId} labs={labs.data.labs} />
      )}
    </div>
  );
}

function StudentLabs({ org, courseId, labs }: { org: string; courseId: string; labs: LabView[] }) {
  const t = useT();
  if (labs.length === 0) {
    return (
      <div className="mt-4 grid place-items-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
        <FlaskConical className="size-8 text-muted" aria-hidden="true" />
        <p className="mt-3 text-sm text-muted">{t.labs.studentsEmpty}</p>
      </div>
    );
  }
  return (
    <ul className="mt-4 grid gap-4 sm:grid-cols-2">
      {labs.map((lab) => (
        <li
          key={lab.id}
          className="relative rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent/50"
        >
          <p className="text-xs font-medium tracking-wide text-muted uppercase">{t.labs.heading(lab.n, lab.week)}</p>
          <h3 className="mt-1 font-semibold">
            {/* The whole card opens the lab. */}
            <LabLink
              org={org}
              courseId={courseId}
              lab={lab}
              className="after:absolute after:inset-0 after:rounded-2xl"
            />
          </h3>
          {lab.summary && <p className="mt-2 text-sm text-muted">{lab.summary}</p>}
          {lab.solutionsAvailable && (
            <Chip size="sm" color="success" variant="soft" className="mt-3">
              {t.labs.solutionsAvailable}
            </Chip>
          )}
        </li>
      ))}
    </ul>
  );
}

function StaffLabs({
  org,
  courseId,
  groups,
  list,
}: Props & { list: { labs: LabView[]; permissions: { manage: boolean; publish: boolean } } }) {
  const changes = useLabChanges(org, courseId);
  const [adding, setAdding] = useState(false);
  const t = useT();
  const nextNumber = Math.max(0, ...list.labs.map((lab) => lab.n)) + 1;

  return (
    <>
      {list.labs.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          {t.labs.staffEmpty}
          {list.permissions.manage ? ` ${t.labs.addFirst}` : ''}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {list.labs.map((lab) => (
            <li key={lab.id}>
              <LabRow
                lab={lab}
                groups={groups}
                org={org}
                courseId={courseId}
                canPublish={list.permissions.publish}
                canManage={list.permissions.manage}
              />
            </li>
          ))}
        </ul>
      )}
      {list.permissions.manage &&
        (adding ? (
          <LabForm
            initial={{ n: nextNumber, title: '', week: null, summary: null }}
            submitLabel={t.labs.addSubmit}
            isPending={changes.addLab.isPending}
            onCancel={() => setAdding(false)}
            onSubmit={(fields) => changes.addLab.mutate(fields, { onSuccess: () => setAdding(false) })}
          />
        ) : (
          <Button variant="secondary" className="mt-4" onPress={() => setAdding(true)}>
            <Plus className="size-4" /> {t.labs.add}
          </Button>
        ))}
    </>
  );
}

function LabRow({
  lab,
  groups,
  org,
  courseId,
  canPublish,
  canManage,
}: {
  lab: LabView;
  groups: GroupView[];
  org: string;
  courseId: string;
  canPublish: boolean;
  canManage: boolean;
}) {
  const changes = useLabChanges(org, courseId);
  const [panel, setPanel] = useState<'none' | 'schedule' | 'edit'>('none');
  const t = useT();
  const visibility = lab.visibility;
  const courseRule = visibility?.rules.find((rule) => rule.groupId === null);
  const courseState = visibility?.course ?? 'hidden';
  const differing = visibility?.groups.filter((g) => g.ownRule) ?? [];
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? t.labs.groupFallback;
  const now = () => new Date().toISOString();

  function toggle(open: boolean) {
    const until =
      courseRule?.visibleUntil && Date.parse(courseRule.visibleUntil) > Date.now() ? courseRule.visibleUntil : null;
    changes.setRule.mutate({
      labId: lab.id,
      rule: {
        groupId: null,
        visibleFrom: open ? now() : null,
        visibleUntil: open ? until : null,
        solutionsFrom: courseRule?.solutionsFrom ?? null,
      },
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">{t.labs.heading(lab.n, lab.week)}</p>
          <h3 className="mt-0.5 font-semibold">
            <LabLink org={org} courseId={courseId} lab={lab} className="hover:text-accent" />
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip size="sm" variant="soft" color={STATE_COLOR[courseState]}>
              {differing.length > 0 ? t.labs.coursePrefix : ''}
              {stateLabel(t, courseState, courseRule)}
            </Chip>
            {differing.map((group) => (
              <Chip key={group.groupId} size="sm" variant="soft" color={STATE_COLOR[group.state]}>
                {groupName(group.groupId)}:{' '}
                {stateLabel(
                  t,
                  group.state,
                  visibility?.rules.find((rule) => rule.groupId === group.groupId),
                )}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPublish && (
            <Switch
              isSelected={courseState === 'open'}
              isDisabled={changes.setRule.isPending}
              onChange={toggle}
              aria-label={t.labs.openSwitch(lab.title)}
              className="flex-row items-center gap-2"
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Content>
                <Label className="text-sm">{t.labs.open}</Label>
              </Switch.Content>
            </Switch>
          )}
          {canPublish && (
            <Button size="sm" variant="tertiary" onPress={() => setPanel(panel === 'schedule' ? 'none' : 'schedule')}>
              <CalendarClock className="size-4" /> {t.labs.schedule}
            </Button>
          )}
          {canManage && (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={t.labs.edit(lab.title)}
              onPress={() => setPanel(panel === 'edit' ? 'none' : 'edit')}
            >
              <Pencil className="size-4" />
            </Button>
          )}
          {canManage && <DeleteLab lab={lab} onDelete={() => changes.deleteLab.mutate(lab.id)} />}
        </div>
      </div>

      {panel === 'schedule' && visibility && (
        <div className="mt-4 grid gap-3 border-t border-separator pt-4">
          <RuleEditor
            title={t.labs.allGroups}
            rule={courseRule}
            onSave={(rule) => changes.setRule.mutate({ labId: lab.id, rule: { ...rule, groupId: null } })}
            isPending={changes.setRule.isPending}
          />
          {groups.map((group) => {
            const own = visibility.rules.find((rule) => rule.groupId === group.id);
            return (
              <RuleEditor
                key={group.id}
                title={group.name}
                rule={own}
                inheritsFromCourse={!own}
                onFollowCourse={
                  own ? () => changes.followCourse.mutate({ labId: lab.id, groupId: group.id }) : undefined
                }
                onSave={(rule) => changes.setRule.mutate({ labId: lab.id, rule: { ...rule, groupId: group.id } })}
                isPending={changes.setRule.isPending || changes.followCourse.isPending}
              />
            );
          })}
        </div>
      )}

      {panel === 'edit' && (
        <LabForm
          initial={{ n: lab.n, title: lab.title, week: lab.week, summary: lab.summary }}
          submitLabel={t.common.save}
          isPending={changes.updateLab.isPending}
          onCancel={() => setPanel('none')}
          onSubmit={(fields) =>
            changes.updateLab.mutate({ labId: lab.id, fields }, { onSuccess: () => setPanel('none') })
          }
        />
      )}
    </div>
  );
}

type Mode = 'hidden' | 'open' | 'scheduled';

/** When one lab is open: for the whole course, or differently for one group. */
function RuleEditor({
  title,
  rule,
  inheritsFromCourse = false,
  onFollowCourse,
  onSave,
  isPending,
}: {
  title: string;
  rule: LabRule | undefined;
  inheritsFromCourse?: boolean;
  onFollowCourse?: () => void;
  onSave: (rule: Omit<LabRule, 'groupId'>) => void;
  isPending: boolean;
}) {
  const initialMode: Mode = !rule?.visibleFrom
    ? 'hidden'
    : Date.parse(rule.visibleFrom) > Date.now()
      ? 'scheduled'
      : 'open';
  const [editing, setEditing] = useState(!inheritsFromCourse);
  const t = useT();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const mode = String(data.get('mode')) as Mode;
    const from = String(data.get('from') ?? '');
    const visibleFrom =
      mode === 'hidden'
        ? null
        : mode === 'open'
          ? rule?.visibleFrom && Date.parse(rule.visibleFrom) <= Date.now()
            ? rule.visibleFrom
            : new Date().toISOString()
          : fromLocalInput(from);
    onSave({
      visibleFrom,
      visibleUntil: mode === 'hidden' ? null : fromLocalInput(String(data.get('until') ?? '')),
      solutionsFrom: fromLocalInput(String(data.get('solutions') ?? '')),
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-secondary px-4 py-3">
        <p className="text-sm">
          <span className="font-medium">{title}</span> <span className="text-muted">{t.labs.followsCourse}</span>
        </p>
        <Button size="sm" variant="ghost" onPress={() => setEditing(true)}>
          {t.labs.differForGroup}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label={t.labs.scheduleFor(title)}
      className="grid gap-3 rounded-xl bg-surface-secondary p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <p className="font-medium sm:col-span-2 lg:col-span-4">{title}</p>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{t.labs.state}</span>
        <select name="mode" defaultValue={initialMode} className="h-10 rounded-xl border border-border bg-surface px-3">
          <option value="hidden">{t.labs.modeHidden}</option>
          <option value="open">{t.labs.modeOpen}</option>
          <option value="scheduled">{t.labs.modeScheduled}</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{t.labs.opensOn}</span>
        <input
          type="datetime-local"
          name="from"
          defaultValue={toLocalInput(rule?.visibleFrom ?? null)}
          className="h-10 rounded-xl border border-border bg-surface px-3"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{t.labs.closesOn}</span>
        <input
          type="datetime-local"
          name="until"
          defaultValue={toLocalInput(rule?.visibleUntil ?? null)}
          className="h-10 rounded-xl border border-border bg-surface px-3"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{t.labs.solutionsFrom}</span>
        <input
          type="datetime-local"
          name="solutions"
          defaultValue={toLocalInput(rule?.solutionsFrom ?? null)}
          className="h-10 rounded-xl border border-border bg-surface px-3"
        />
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="submit" size="sm" variant="primary" isPending={isPending}>
          {t.labs.saveSchedule}
        </Button>
        {onFollowCourse && (
          <Button size="sm" variant="ghost" onPress={onFollowCourse}>
            {t.labs.likeCourse}
          </Button>
        )}
        {inheritsFromCourse && (
          <Button size="sm" variant="ghost" onPress={() => setEditing(false)}>
            {t.common.cancel}
          </Button>
        )}
      </div>
    </form>
  );
}

function LabForm({
  initial,
  submitLabel,
  isPending,
  onCancel,
  onSubmit,
}: {
  initial: LabFields;
  submitLabel: string;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (fields: LabFields) => void;
}) {
  const t = useT();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const week = String(data.get('week') ?? '').trim();
    const summary = String(data.get('summary') ?? '').trim();
    onSubmit({
      n: Number(data.get('n')),
      title: String(data.get('title') ?? '').trim(),
      week: week ? Number(week) : null,
      summary: summary || null,
    });
  }
  const field = 'h-10 rounded-xl border border-border bg-surface px-3';
  return (
    <form
      onSubmit={submit}
      aria-label={submitLabel}
      className="mt-4 grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[6rem_1fr_6rem]"
    >
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{t.labs.number}</span>
        <input name="n" type="number" min={0} max={99} required defaultValue={initial.n} className={field} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{t.labs.titleLabel}</span>
        <input name="title" required maxLength={160} defaultValue={initial.title} className={field} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{t.labs.week}</span>
        <input name="week" type="number" min={1} max={60} defaultValue={initial.week ?? ''} className={field} />
      </label>
      <label className="grid gap-1 text-sm sm:col-span-3">
        <span className="font-medium">{t.labs.summary}</span>
        <input name="summary" maxLength={600} defaultValue={initial.summary ?? ''} className={field} />
      </label>
      <div className="flex gap-2 sm:col-span-3">
        <Button type="submit" variant="primary" size="sm" isPending={isPending}>
          {submitLabel}
        </Button>
        <Button variant="ghost" size="sm" onPress={onCancel}>
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}

function DeleteLab({ lab, onDelete }: { lab: LabView; onDelete: () => void }) {
  const t = useT();
  return (
    <AlertDialog>
      <Button isIconOnly size="sm" variant="ghost" aria-label={t.labs.deleteLabel(lab.title)}>
        <Trash2 className="size-4" />
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>{t.labs.deleteTitle(lab.title)}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>{t.labs.deleteText}</AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                {t.common.cancel}
              </Button>
              <Button slot="close" variant="danger" onPress={onDelete}>
                {t.labs.deleteConfirm}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

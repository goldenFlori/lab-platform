import { Alert, AlertDialog, Button, Chip, Label, Switch } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, FlaskConical, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { GroupView } from '../../shared/courses';
import type { LabRule, LabState, LabView } from '../../shared/labs';
import { formatMoment, fromLocalInput, type LabFields, labsQuery, toLocalInput, useLabChanges } from '../lib/labs';

type Props = { org: string; courseId: string; groups: GroupView[] };

const STATE_COLOR: Record<LabState, 'default' | 'accent' | 'success' | 'warning' | 'danger'> = {
  hidden: 'default',
  scheduled: 'warning',
  open: 'success',
  closed: 'default',
};

function stateLabel(state: LabState, rule: LabRule | undefined) {
  if (state === 'scheduled' && rule?.visibleFrom) return `Hapet ${formatMoment(rule.visibleFrom)}`;
  if (state === 'open' && rule?.visibleUntil) return `E hapur deri ${formatMoment(rule.visibleUntil)}`;
  return { hidden: 'E fshehur', scheduled: 'Me orar', open: 'E hapur', closed: 'E mbyllur' }[state];
}

const labHeading = (lab: LabView) => `Laboratori ${lab.n}${lab.week ? ` · Java ${lab.week}` : ''}`;

export function CourseLabs({ org, courseId, groups }: Props) {
  const labs = useQuery(labsQuery(org, courseId));

  return (
    <div className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">Laboratorët</h2>
      {labs.isPending ? (
        <p className="mt-3 text-sm text-muted">Duke ngarkuar…</p>
      ) : labs.isError ? (
        <Alert status="danger" className="mt-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>Laboratorët nuk u ngarkuan. Provoni përsëri.</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : labs.data.permissions.staff ? (
        <StaffLabs org={org} courseId={courseId} groups={groups} list={labs.data} />
      ) : (
        <StudentLabs labs={labs.data.labs} />
      )}
    </div>
  );
}

function StudentLabs({ labs }: { labs: LabView[] }) {
  if (labs.length === 0) {
    return (
      <div className="mt-4 grid place-items-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
        <FlaskConical className="size-8 text-muted" aria-hidden="true" />
        <p className="mt-3 text-sm text-muted">Laboratorët shfaqen këtu sapo pedagogu t'i hapë.</p>
      </div>
    );
  }
  return (
    <ul className="mt-4 grid gap-4 sm:grid-cols-2">
      {labs.map((lab) => (
        <li key={lab.id} className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">{labHeading(lab)}</p>
          <h3 className="mt-1 font-semibold">{lab.title}</h3>
          {lab.summary && <p className="mt-2 text-sm text-muted">{lab.summary}</p>}
          {lab.solutionsAvailable && (
            <Chip size="sm" color="success" variant="soft" className="mt-3">
              Zgjidhjet janë të disponueshme
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
  const nextNumber = Math.max(0, ...list.labs.map((lab) => lab.n)) + 1;

  return (
    <>
      {list.labs.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Ky kurs nuk ka ende laboratorë.{list.permissions.manage ? ' Shtoni të parin.' : ''}
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
            submitLabel="Shto laboratorin"
            isPending={changes.addLab.isPending}
            onCancel={() => setAdding(false)}
            onSubmit={(fields) => changes.addLab.mutate(fields, { onSuccess: () => setAdding(false) })}
          />
        ) : (
          <Button variant="secondary" className="mt-4" onPress={() => setAdding(true)}>
            <Plus className="size-4" /> Shto laborator
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
  const visibility = lab.visibility;
  const courseRule = visibility?.rules.find((rule) => rule.groupId === null);
  const courseState = visibility?.course ?? 'hidden';
  const differing = visibility?.groups.filter((g) => g.ownRule) ?? [];
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? 'Grup';
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
          <p className="text-xs font-medium tracking-wide text-muted uppercase">{labHeading(lab)}</p>
          <h3 className="mt-0.5 font-semibold">{lab.title}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip size="sm" variant="soft" color={STATE_COLOR[courseState]}>
              {differing.length > 0 ? 'Kursi: ' : ''}
              {stateLabel(courseState, courseRule)}
            </Chip>
            {differing.map((group) => (
              <Chip key={group.groupId} size="sm" variant="soft" color={STATE_COLOR[group.state]}>
                {groupName(group.groupId)}:{' '}
                {stateLabel(
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
              aria-label={`Hapur për studentët: ${lab.title}`}
              className="flex-row items-center gap-2"
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Content>
                <Label className="text-sm">Hapur</Label>
              </Switch.Content>
            </Switch>
          )}
          {canPublish && (
            <Button size="sm" variant="tertiary" onPress={() => setPanel(panel === 'schedule' ? 'none' : 'schedule')}>
              <CalendarClock className="size-4" /> Orari
            </Button>
          )}
          {canManage && (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={`Ndrysho ${lab.title}`}
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
            title="Të gjitha grupet"
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
          submitLabel="Ruaj"
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
          <span className="font-medium">{title}</span> <span className="text-muted">ndjek kursin</span>
        </p>
        <Button size="sm" variant="ghost" onPress={() => setEditing(true)}>
          Ndryshe për këtë grup
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label={`Orari: ${title}`}
      className="grid gap-3 rounded-xl bg-surface-secondary p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <p className="font-medium sm:col-span-2 lg:col-span-4">{title}</p>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Gjendja</span>
        <select name="mode" defaultValue={initialMode} className="h-10 rounded-xl border border-border bg-surface px-3">
          <option value="hidden">E fshehur</option>
          <option value="open">E hapur</option>
          <option value="scheduled">Hapet më…</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Hapet më</span>
        <input
          type="datetime-local"
          name="from"
          defaultValue={toLocalInput(rule?.visibleFrom ?? null)}
          className="h-10 rounded-xl border border-border bg-surface px-3"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Mbyllet më (s'është e detyrueshme)</span>
        <input
          type="datetime-local"
          name="until"
          defaultValue={toLocalInput(rule?.visibleUntil ?? null)}
          className="h-10 rounded-xl border border-border bg-surface px-3"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Zgjidhjet për studentët nga</span>
        <input
          type="datetime-local"
          name="solutions"
          defaultValue={toLocalInput(rule?.solutionsFrom ?? null)}
          className="h-10 rounded-xl border border-border bg-surface px-3"
        />
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="submit" size="sm" variant="primary" isPending={isPending}>
          Ruaj orarin
        </Button>
        {onFollowCourse && (
          <Button size="sm" variant="ghost" onPress={onFollowCourse}>
            Si gjithë kursi
          </Button>
        )}
        {inheritsFromCourse && (
          <Button size="sm" variant="ghost" onPress={() => setEditing(false)}>
            Anulo
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
        <span className="font-medium">Nr.</span>
        <input name="n" type="number" min={0} max={99} required defaultValue={initial.n} className={field} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Titulli</span>
        <input name="title" required maxLength={160} defaultValue={initial.title} className={field} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Java</span>
        <input name="week" type="number" min={1} max={60} defaultValue={initial.week ?? ''} className={field} />
      </label>
      <label className="grid gap-1 text-sm sm:col-span-3">
        <span className="font-medium">Përmbledhje (s'është e detyrueshme)</span>
        <input name="summary" maxLength={600} defaultValue={initial.summary ?? ''} className={field} />
      </label>
      <div className="flex gap-2 sm:col-span-3">
        <Button type="submit" variant="primary" size="sm" isPending={isPending}>
          {submitLabel}
        </Button>
        <Button variant="ghost" size="sm" onPress={onCancel}>
          Anulo
        </Button>
      </div>
    </form>
  );
}

function DeleteLab({ lab, onDelete }: { lab: LabView; onDelete: () => void }) {
  return (
    <AlertDialog>
      <Button isIconOnly size="sm" variant="ghost" aria-label={`Fshi ${lab.title}`}>
        <Trash2 className="size-4" />
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Të fshihet {lab.title}?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>Laboratori dhe orari i tij fshihen nga ky kurs.</AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                Anulo
              </Button>
              <Button slot="close" variant="danger" onPress={onDelete}>
                Fshi laboratorin
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

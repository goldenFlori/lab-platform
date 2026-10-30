import { Button, Label, Switch } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Inbox, Send } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { GroupView } from '../../../shared/courses';
import { KOLOKIUM_MINUTES } from '../../../shared/kolokium';
import type { Assignment } from '../../../shared/submissions';
import { useT } from '../../i18n';
import { formatMoment, fromLocalInput, toLocalInput } from '../../lib/labs';
import type { NotebookRef } from '../../lib/notebooks';
import { assignmentsQuery, useAssignmentChanges } from '../../lib/submissions';

// Staff open a notebook for submission to each group, with a deadline, and go to what was handed in
// (#52), or as a timed kolokium (#169). Those who may only review see the deadlines and the way to
// the submissions.

export function AssignmentsEditor({
  notebookRef,
  groups,
  canPublish,
}: {
  notebookRef: NotebookRef;
  groups: GroupView[];
  canPublish: boolean;
}) {
  const t = useT();
  const query = useQuery(assignmentsQuery(notebookRef));
  const assignments = query.data ?? [];
  return (
    <details className="group rounded-2xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
        <Send className="size-4 shrink-0 text-accent" aria-hidden="true" />
        <span className="flex-1 text-sm font-semibold">{t.submissions.editorTitle(assignments.length)}</span>
        <span className="text-xs text-muted group-open:hidden">{t.submissions.edit}</span>
      </summary>
      <div className="border-t border-border p-4">
        <p className="text-sm text-muted">{t.submissions.help}</p>
        {groups.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t.submissions.noGroups}</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {groups.map((group) => (
              <li key={group.id}>
                <GroupDeadline
                  notebookRef={notebookRef}
                  group={group}
                  assignment={assignments.find((a) => a.groupId === group.id)}
                  canPublish={canPublish}
                />
              </li>
            ))}
          </ul>
        )}
        <Link
          to="/o/$org/courses/$courseId/labs/$labId/submissions"
          params={{ org: notebookRef.org, courseId: notebookRef.courseId, labId: notebookRef.labId }}
          search={{ notebook: notebookRef.notebookId }}
          className="button button--secondary button--sm mt-4 gap-2"
        >
          <Inbox className="size-4" aria-hidden="true" /> {t.submissions.view}
        </Link>
      </div>
    </details>
  );
}

function GroupDeadline({
  notebookRef,
  group,
  assignment,
  canPublish,
}: {
  notebookRef: NotebookRef;
  group: GroupView;
  assignment: Assignment | undefined;
  canPublish: boolean;
}) {
  const t = useT();
  const changes = useAssignmentChanges(notebookRef);
  const [error, setError] = useState<string | null>(null);
  const [timed, setTimed] = useState(!!assignment?.kolokium);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dueAt = fromLocalInput(String(form.get('due') ?? ''));
    if (!dueAt) return setError(t.submissions.pickDue);
    let kolokium = null;
    if (timed) {
      const opensAt = fromLocalInput(String(form.get('opens') ?? ''));
      if (!opensAt || opensAt >= dueAt) return setError(t.kolokium.pickOpens);
      const minutes = Number(form.get('minutes'));
      if (!Number.isInteger(minutes) || minutes < KOLOKIUM_MINUTES.min || minutes > KOLOKIUM_MINUTES.max) {
        return setError(t.kolokium.pickMinutes(KOLOKIUM_MINUTES.min, KOLOKIUM_MINUTES.max));
      }
      kolokium = { opensAt, minutes };
    }
    setError(null);
    try {
      await changes.open.mutateAsync({ groupId: group.id, dueAt, kolokium });
    } catch {
      setError(t.submissions.saveFailed);
    }
  }

  const status = assignment
    ? [
        t.submissions.openUntil(formatMoment(assignment.dueAt)),
        assignment.kolokium && t.kolokium.setup(assignment.kolokium.minutes, formatMoment(assignment.kolokium.opensAt)),
      ]
        .filter(Boolean)
        .join(' · ')
    : t.submissions.closed;
  return (
    <form
      onSubmit={save}
      aria-label={group.name}
      className="flex flex-wrap items-end gap-3 rounded-xl bg-surface-secondary p-3"
    >
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-sm font-semibold">{group.name}</p>
        <p className={`text-xs ${assignment ? 'text-success' : 'text-muted'}`}>{status}</p>
      </div>
      {canPublish && (
        <>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{t.submissions.dueAt(group.name)}</span>
            <input
              type="datetime-local"
              name="due"
              // A new deadline replaces the field's value.
              key={assignment?.dueAt ?? 'none'}
              defaultValue={toLocalInput(assignment?.dueAt ?? null)}
              className="h-10 rounded-xl border border-border bg-surface px-3"
            />
          </label>
          {timed && (
            <>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">{t.kolokium.opensAt(group.name)}</span>
                <input
                  type="datetime-local"
                  name="opens"
                  key={assignment?.kolokium?.opensAt ?? 'none'}
                  defaultValue={toLocalInput(assignment?.kolokium?.opensAt ?? null)}
                  className="h-10 rounded-xl border border-border bg-surface px-3"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">{t.kolokium.minutes}</span>
                <input
                  type="number"
                  name="minutes"
                  min={KOLOKIUM_MINUTES.min}
                  max={KOLOKIUM_MINUTES.max}
                  key={assignment?.kolokium?.minutes ?? 'none'}
                  defaultValue={assignment?.kolokium?.minutes ?? 45}
                  className="h-10 w-24 rounded-xl border border-border bg-surface px-3"
                />
              </label>
            </>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="primary" isPending={changes.open.isPending}>
              {assignment ? t.submissions.move : t.submissions.open}
            </Button>
            {assignment && (
              <Button
                size="sm"
                variant="ghost"
                isPending={changes.close.isPending}
                onPress={() => changes.close.mutate(group.id, { onError: () => setError(t.submissions.saveFailed) })}
              >
                {t.submissions.close}
              </Button>
            )}
          </div>
          <div className="grid w-full gap-1">
            <Switch
              isSelected={timed}
              onChange={setTimed}
              aria-describedby={`kolokium-help-${group.id}`}
              className="flex-row items-center gap-2"
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Content>
                <Label className="text-sm font-medium">{t.kolokium.option}</Label>
              </Switch.Content>
            </Switch>
            <span id={`kolokium-help-${group.id}`} className="text-xs text-muted">
              {t.kolokium.optionHelp}
            </span>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

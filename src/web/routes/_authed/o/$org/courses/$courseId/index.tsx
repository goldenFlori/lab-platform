import { AlertDialog, Button, Chip, FieldError, Form, Input, Label, Switch, TextField } from '@heroui/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BarChart3,
  Lock,
  MonitorUp,
  Plus,
  RefreshCw,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { CourseDetail, GroupView } from '../../../../../../../shared/courses';
import { formatJoinCode } from '../../../../../../../shared/join-code';
import { isLocale, LOCALES } from '../../../../../../../shared/locale';
import { CourseLabs } from '../../../../../../components/CourseLabs';
import { CourseStaff } from '../../../../../../components/CourseStaff';
import { PresentJoinCode } from '../../../../../../components/PresentJoinCode';
import { LANGUAGE_NAMES, t as messages, useT } from '../../../../../../i18n';
import { ApiError } from '../../../../../../lib/api';
import { APP_NAME } from '../../../../../../lib/brand';
import { courseQuery, useCourseChanges } from '../../../../../../lib/courses';

export const Route = createFileRoute('/_authed/o/$org/courses/$courseId/')({
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(courseQuery(params.org, params.courseId));
    } catch (error) {
      // Missing, or not ours to see: the same 404 page either way.
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.course.title ?? messages().course.pageTitle} · ${APP_NAME}` }],
  }),
  component: CoursePage,
});

function CoursePage() {
  const { org, courseId } = Route.useParams();
  const { data } = useSuspenseQuery(courseQuery(org, courseId));
  const { course, groups, permissions } = data;
  const changes = useCourseChanges(org, courseId);
  const navigate = Route.useNavigate();
  const isStaff = permissions.manage || groups.some((g) => g.permissions.manageStudents);
  const archived = course.archivedAt !== null;
  const t = useT();

  return (
    <section className="container-page py-10">
      <Link to="/courses" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> {t.course.back}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{course.title}</h1>
            {archived && <Chip variant="secondary">{t.course.archived}</Chip>}
          </div>
          <p className="mt-1 text-muted">{t.course.academicYear(course.academicYear)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {permissions.analytics && (
            <Link
              to="/o/$org/courses/$courseId/activity"
              params={{ org, courseId }}
              className="button button--tertiary gap-2"
            >
              <BarChart3 className="size-4" /> {t.course.activity}
            </Link>
          )}
          {permissions.manage && (
            <Button
              variant="tertiary"
              isPending={changes.archive.isPending}
              onPress={() => changes.archive.mutate(!archived)}
            >
              {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              {archived ? t.course.unarchive : t.course.archive}
            </Button>
          )}
          {permissions.manage && (
            <DeleteCourse
              title={course.title}
              groups={groups.length}
              isPending={changes.remove.isPending}
              onDelete={async () => {
                try {
                  await changes.remove.mutateAsync();
                } catch {
                  return; // Not deleted: the course stays, as it was.
                }
                await navigate({ to: '/courses' });
                changes.forget();
              }}
            />
          )}
        </div>
      </div>

      {permissions.manage && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label htmlFor="course-locale" className="text-sm font-medium">
            {t.course.language}
          </label>
          <select
            id="course-locale"
            value={course.locale ?? ''}
            disabled={changes.setLocale.isPending}
            onChange={(e) => changes.setLocale.mutate(isLocale(e.target.value) ? e.target.value : null)}
            aria-describedby="course-locale-help"
            className="h-9 rounded-xl border border-border bg-surface px-3 text-sm"
          >
            <option value="">{LANGUAGE_NAMES.sq}</option>
            {LOCALES.filter((code) => code !== 'sq').map((code) => (
              <option key={code} value={code} lang={code}>
                {LANGUAGE_NAMES[code]}
              </option>
            ))}
          </select>
          <span id="course-locale-help" className="text-xs text-muted">
            {t.course.languageHelp}
          </span>
        </div>
      )}

      {permissions.configureAi && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Switch
            isSelected={course.ai}
            isDisabled={changes.setAi.isPending}
            onChange={(on) => changes.setAi.mutate(on)}
            aria-describedby="course-ai-help"
            className="flex-row items-center gap-2"
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.Content>
              <Label className="text-sm font-medium">{t.course.ai}</Label>
            </Switch.Content>
          </Switch>
          <span id="course-ai-help" className="text-xs text-muted">
            {t.course.aiHelp}
          </span>
        </div>
      )}

      {isStaff && (
        <Groups data={data} org={org} courseId={courseId} archived={archived} canManage={permissions.manage} />
      )}

      <CourseLabs org={org} courseId={courseId} groups={groups} />

      {permissions.manage && <CourseStaff org={org} courseId={courseId} groups={groups} />}
    </section>
  );
}

function Groups({
  data,
  org,
  courseId,
  archived,
  canManage,
}: {
  data: CourseDetail;
  org: string;
  courseId: string;
  archived: boolean;
  canManage: boolean;
}) {
  const changes = useCourseChanges(org, courseId);
  const t = useT();

  function onAddGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    changes.addGroup.mutate(String(new FormData(form).get('name') ?? ''), { onSuccess: () => form.reset() });
  }

  return (
    <div className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">{t.course.groups}</h2>
      {archived && <p className="mt-2 text-sm text-muted">{t.course.archivedNote}</p>}
      {data.groups.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t.course.noGroups}</p>
      ) : (
        <ul className="mt-4 grid gap-4 lg:grid-cols-2">
          {data.groups.map((group) => (
            <li key={group.id}>
              <GroupCard
                group={group}
                courseTitle={data.course.title}
                org={org}
                courseId={courseId}
                archived={archived}
                canManage={canManage}
              />
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <Form onSubmit={onAddGroup} aria-label={t.course.addGroup} className="mt-4 flex flex-wrap items-start gap-3">
          <TextField name="name" isRequired aria-label={t.course.groupName} className="w-full max-w-xs">
            <Input placeholder={t.course.groupPlaceholder} />
            <FieldError>{t.course.groupNameMissing}</FieldError>
          </TextField>
          <Button type="submit" variant="secondary" isPending={changes.addGroup.isPending}>
            <Plus className="size-4" /> {t.course.addGroupSubmit}
          </Button>
        </Form>
      )}
    </div>
  );
}

function GroupCard({
  group,
  courseTitle,
  org,
  courseId,
  archived,
  canManage,
}: {
  group: GroupView;
  courseTitle: string;
  org: string;
  courseId: string;
  archived: boolean;
  canManage: boolean;
}) {
  const changes = useCourseChanges(org, courseId);
  const [presenting, setPresenting] = useState(false);
  const t = useT();
  const code = group.joinCode;
  const switching = changes.switchJoinCode.isPending && changes.switchJoinCode.variables?.groupId === group.id;

  return (
    <div className="h-full rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">{group.name}</h3>
        {canManage && <DeleteGroup group={group} onDelete={() => changes.deleteGroup.mutate(group.id)} />}
      </div>

      {group.permissions.manageStudents && (
        <>
          <p className="mt-4 text-xs font-medium tracking-wide text-muted uppercase">{t.course.joinCode}</p>
          {code ? (
            <p className="mt-1 font-mono text-3xl font-bold tracking-widest" data-testid="join-code">
              {formatJoinCode(code)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">{t.course.joiningClosed}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/o/$org/courses/$courseId/groups/$groupId"
              params={{ org, courseId, groupId: group.id }}
              className="button button--sm button--secondary gap-1.5"
            >
              <Users className="size-4" /> {t.course.students}
            </Link>
            {code && !archived && (
              <Button size="sm" variant="primary" onPress={() => setPresenting(true)}>
                <MonitorUp className="size-4" /> {t.course.present}
              </Button>
            )}
            <Button
              size="sm"
              variant="tertiary"
              isPending={switching}
              onPress={() => changes.switchJoinCode.mutate({ groupId: group.id, enabled: true })}
            >
              {code ? <RefreshCw className="size-4" /> : <Unlock className="size-4" />}
              {code ? t.course.newCode : t.course.openJoining}
            </Button>
            {code && (
              <Button
                size="sm"
                variant="ghost"
                isPending={switching}
                onPress={() => changes.switchJoinCode.mutate({ groupId: group.id, enabled: false })}
              >
                <Lock className="size-4" /> {t.course.closeJoining}
              </Button>
            )}
          </div>
        </>
      )}

      {presenting && code && (
        <PresentJoinCode
          code={code}
          courseTitle={courseTitle}
          groupName={group.name}
          onClose={() => setPresenting(false)}
        />
      )}
    </div>
  );
}

function DeleteGroup({ group, onDelete }: { group: GroupView; onDelete: () => void }) {
  const t = useT();
  return (
    <AlertDialog>
      <Button isIconOnly size="sm" variant="ghost" aria-label={t.course.deleteGroupLabel(group.name)}>
        <Trash2 className="size-4" />
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>{t.course.deleteGroupTitle(group.name)}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>{t.course.deleteGroupText}</AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                {t.common.cancel}
              </Button>
              <Button slot="close" variant="danger" onPress={onDelete}>
                {t.course.deleteGroup}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

/** Deleting the course (#80), after a popup that says what goes with it. */
function DeleteCourse({
  title,
  groups,
  isPending,
  onDelete,
}: {
  title: string;
  groups: number;
  isPending: boolean;
  onDelete: () => void;
}) {
  const t = useT();
  return (
    <AlertDialog>
      <Button variant="danger-soft" isPending={isPending}>
        <Trash2 className="size-4" /> {t.course.deleteCourse}
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>{t.course.deleteCourseTitle(title)}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>{t.course.deleteCourseText(groups)}</p>
              <p className="mt-2 text-sm text-muted">{t.course.deleteCourseKeep}</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                {t.common.cancel}
              </Button>
              <Button slot="close" variant="danger" onPress={onDelete}>
                {t.course.deleteCourseConfirm}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

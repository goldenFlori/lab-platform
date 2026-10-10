import { AlertDialog, Button, Chip, FieldError, Form, Input, TextField } from '@heroui/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  FlaskConical,
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
import { PresentJoinCode } from '../../../../../../components/PresentJoinCode';
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
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.course.title ?? 'Kursi'} · ${APP_NAME}` }] }),
  component: CoursePage,
});

function CoursePage() {
  const { org, courseId } = Route.useParams();
  const { data } = useSuspenseQuery(courseQuery(org, courseId));
  const { course, groups, permissions } = data;
  const changes = useCourseChanges(org, courseId);
  const isStaff = permissions.manage || groups.some((g) => g.permissions.manageStudents);
  const archived = course.archivedAt !== null;

  return (
    <section className="container-page py-10">
      <Link to="/courses" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> Kurset e mia
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{course.title}</h1>
            {archived && <Chip variant="secondary">I arkivuar</Chip>}
          </div>
          <p className="mt-1 text-muted">Viti akademik {course.academicYear}</p>
        </div>
        {permissions.manage && (
          <Button
            variant="tertiary"
            isPending={changes.archive.isPending}
            onPress={() => changes.archive.mutate(!archived)}
          >
            {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            {archived ? 'Rikthe kursin' : 'Arkivo kursin'}
          </Button>
        )}
      </div>

      {isStaff && (
        <Groups data={data} org={org} courseId={courseId} archived={archived} canManage={permissions.manage} />
      )}

      <div className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">Laboratorët</h2>
        <div className="mt-4 grid place-items-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <FlaskConical className="size-8 text-muted" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted">Laboratorët shfaqen këtu sapo të hapen.</p>
        </div>
      </div>
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

  function onAddGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    changes.addGroup.mutate(String(new FormData(form).get('name') ?? ''), { onSuccess: () => form.reset() });
  }

  return (
    <div className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">Grupet</h2>
      {archived && (
        <p className="mt-2 text-sm text-muted">Kursi është arkivuar: kodet e regjistrimit nuk pranohen më.</p>
      )}
      {data.groups.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Ky kurs nuk ka ende grupe.</p>
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
        <Form onSubmit={onAddGroup} aria-label="Shto grup" className="mt-4 flex flex-wrap items-start gap-3">
          <TextField name="name" isRequired aria-label="Emri i grupit" className="w-full max-w-xs">
            <Input placeholder="Emri i grupit, p.sh. Grupi B" />
            <FieldError>Shkruani emrin e grupit.</FieldError>
          </TextField>
          <Button type="submit" variant="secondary" isPending={changes.addGroup.isPending}>
            <Plus className="size-4" /> Shto grupin
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
          <p className="mt-4 text-xs font-medium tracking-wide text-muted uppercase">Kodi i regjistrimit</p>
          {code ? (
            <p className="mt-1 font-mono text-3xl font-bold tracking-widest" data-testid="join-code">
              {formatJoinCode(code)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">Regjistrimi është i mbyllur.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/o/$org/courses/$courseId/groups/$groupId"
              params={{ org, courseId, groupId: group.id }}
              className="button button--sm button--secondary gap-1.5"
            >
              <Users className="size-4" /> Studentët
            </Link>
            {code && !archived && (
              <Button size="sm" variant="primary" onPress={() => setPresenting(true)}>
                <MonitorUp className="size-4" /> Shfaq në ekran
              </Button>
            )}
            <Button
              size="sm"
              variant="tertiary"
              isPending={switching}
              onPress={() => changes.switchJoinCode.mutate({ groupId: group.id, enabled: true })}
            >
              {code ? <RefreshCw className="size-4" /> : <Unlock className="size-4" />}
              {code ? 'Kod i ri' : 'Hap regjistrimin'}
            </Button>
            {code && (
              <Button
                size="sm"
                variant="ghost"
                isPending={switching}
                onPress={() => changes.switchJoinCode.mutate({ groupId: group.id, enabled: false })}
              >
                <Lock className="size-4" /> Mbyll regjistrimin
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
  return (
    <AlertDialog>
      <Button isIconOnly size="sm" variant="ghost" aria-label={`Fshi ${group.name}`}>
        <Trash2 className="size-4" />
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Të fshihet {group.name}?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              Studentët e këtij grupi largohen nga kursi. Llogaritë e tyre mbeten, por do t'u duhet një kod i ri për t'u
              kthyer.
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                Anulo
              </Button>
              <Button slot="close" variant="danger" onPress={onDelete}>
                Fshi grupin
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

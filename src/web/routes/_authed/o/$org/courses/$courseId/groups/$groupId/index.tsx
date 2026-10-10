import { Alert, AlertDialog, Button } from '@heroui/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ArrowLeft, KeyRound, Printer, Upload, Users } from 'lucide-react';
import type { GroupStudent } from '../../../../../../../../../shared/students';
import { CredentialSlips } from '../../../../../../../../components/CredentialSlips';
import { t as messages, useT } from '../../../../../../../../i18n';
import { ApiError } from '../../../../../../../../lib/api';
import { APP_NAME } from '../../../../../../../../lib/brand';
import { courseQuery } from '../../../../../../../../lib/courses';
import { groupStudentsQuery, useResetPassword } from '../../../../../../../../lib/students';

export const Route = createFileRoute('/_authed/o/$org/courses/$courseId/groups/$groupId/')({
  loader: async ({ context, params }) => {
    try {
      const course = await context.queryClient.ensureQueryData(courseQuery(params.org, params.courseId));
      const group = course.groups.find((g) => g.id === params.groupId);
      if (!group?.permissions.manageStudents) throw notFound();
      await context.queryClient.ensureQueryData(groupStudentsQuery(params.org, params.courseId, params.groupId));
      return { courseTitle: course.course.title, groupName: group.name };
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 403)) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.groupName ?? messages().group.pageTitle} · ${APP_NAME}` }],
  }),
  component: GroupStudentsPage,
});

function GroupStudentsPage() {
  const { org, courseId, groupId } = Route.useParams();
  const { courseTitle, groupName } = Route.useLoaderData();
  const { data: students } = useSuspenseQuery(groupStudentsQuery(org, courseId, groupId));
  const reset = useResetPassword(org, courseId, groupId);
  const t = useT();

  return (
    <section className="container-page py-10">
      <Link
        to="/o/$org/courses/$courseId"
        params={{ org, courseId }}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {courseTitle}
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{groupName}</h1>
          <p className="mt-1 text-muted">{t.group.count(students.length)}</p>
        </div>
        <Link
          to="/o/$org/courses/$courseId/groups/$groupId/import"
          params={{ org, courseId, groupId }}
          className="button button--primary gap-2"
        >
          <Upload className="size-4" /> {t.group.import}
        </Link>
      </div>

      {reset.data && (
        <div className="mt-8 rounded-2xl border border-accent/40 bg-accent-soft/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium">{t.group.newPasswordFor(reset.data.fullName)}</p>
            <Button variant="primary" size="sm" onPress={() => window.print()}>
              <Printer className="size-4" /> {t.group.print}
            </Button>
          </div>
          <div className="mt-4 max-w-md">
            <CredentialSlips slips={[reset.data]} courseTitle={courseTitle} groupName={groupName} />
          </div>
        </div>
      )}
      {reset.isError && (
        <Alert status="danger" className="mt-8">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t.group.resetFailed}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {students.length === 0 ? (
        <div className="mt-8 grid place-items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <Users className="size-8 text-muted" aria-hidden="true" />
          <p className="mt-3 font-medium">{t.group.emptyTitle}</p>
          <p className="mt-1 max-w-sm text-sm text-muted">{t.group.emptyText}</p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-separator rounded-2xl border border-border bg-surface">
          {students.map((student) => (
            <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{student.fullName}</p>
                <p className="truncate font-mono text-sm text-muted">{student.username}</p>
              </div>
              <ResetPassword
                student={student}
                isPending={reset.isPending && reset.variables?.id === student.id}
                onReset={() => reset.mutate(student)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ResetPassword({
  student,
  isPending,
  onReset,
}: {
  student: GroupStudent;
  isPending: boolean;
  onReset: () => void;
}) {
  const t = useT();
  return (
    <AlertDialog>
      <Button size="sm" variant="tertiary" isPending={isPending} aria-label={t.group.resetLabel(student.fullName)}>
        <KeyRound className="size-4" /> {t.group.reset}
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>{t.group.resetTitle(student.fullName)}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>{t.group.resetText}</AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                {t.common.cancel}
              </Button>
              <Button slot="close" variant="primary" onPress={onReset}>
                {t.group.resetConfirm}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

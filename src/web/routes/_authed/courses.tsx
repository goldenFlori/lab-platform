import { Alert, Button, Chip, FieldError, Form, Input, Label, TextField } from '@heroui/react';
import { useQueries } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { GraduationCap, KeyRound, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { Me } from '../../../shared/auth';
import type { CourseSummary } from '../../../shared/courses';
import { isLocale, LOCALES } from '../../../shared/locale';
import { LANGUAGE_NAMES, t as messages, useT } from '../../i18n';
import { useMe } from '../../lib/auth';
import { APP_NAME } from '../../lib/brand';
import { coursesQuery, currentAcademicYear, orgAccessQuery, useCreateCourse } from '../../lib/courses';

export const Route = createFileRoute('/_authed/courses')({
  head: () => ({ meta: [{ title: `${messages().courses.pageTitle} · ${APP_NAME}` }] }),
  component: CoursesPage,
});

type Organization = Me['organizations'][number];

function CoursesPage() {
  const t = useT();
  const organizations = useMe()?.organizations ?? [];
  const courses = useQueries({ queries: organizations.map((org) => coursesQuery(org.slug)) });
  const access = useQueries({ queries: organizations.map((org) => orgAccessQuery(org.slug)) });
  const loading = [...courses, ...access].some((query) => query.isPending);

  // Only organizations with something to show: courses, an error, or the right to create one.
  const sections = organizations
    .map((org, i) => ({
      org,
      courses: courses[i]?.data ?? [],
      failed: courses[i]?.isError ?? false,
      canCreate: access[i]?.data?.capabilities.organization.includes('course.create') ?? false,
    }))
    .filter((section) => section.courses.length > 0 || section.failed || section.canCreate);

  return (
    <section className="container-page py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t.courses.title}</h1>
        <Link to="/join" className="button button--secondary gap-2">
          <KeyRound className="size-4" /> {t.courses.joinWithCode}
        </Link>
      </div>
      {loading ? (
        <p className="mt-8 text-sm text-muted">{t.common.loading}</p>
      ) : sections.length === 0 ? (
        <NoCourses />
      ) : (
        sections.map((section) => (
          <OrganizationCourses key={section.org.id} {...section} showName={sections.length > 1} />
        ))
      )}
    </section>
  );
}

function NoCourses() {
  const t = useT();
  return (
    <div className="mt-8 grid place-items-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <GraduationCap className="size-8 text-muted" aria-hidden="true" />
      <p className="mt-4 font-medium">{t.courses.noneTitle}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{t.courses.noneText}</p>
      <Link to="/join" className="button button--primary mt-6 gap-2">
        <KeyRound className="size-4" /> {t.courses.joinWithCode}
      </Link>
    </div>
  );
}

function OrganizationCourses({
  org,
  courses,
  failed,
  canCreate,
  showName,
}: {
  org: Organization;
  courses: CourseSummary[];
  failed: boolean;
  canCreate: boolean;
  showName: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const t = useT();

  return (
    <div className="mt-8">
      {(showName || canCreate) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {showName ? <h2 className="text-lg font-semibold">{org.name}</h2> : <span />}
          {canCreate && !creating && (
            <Button variant="tertiary" size="sm" onPress={() => setCreating(true)}>
              <Plus className="size-4" /> {t.courses.newCourse}
            </Button>
          )}
        </div>
      )}
      {creating && <NewCourseForm org={org.slug} courses={courses} onCancel={() => setCreating(false)} />}
      {failed ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t.courses.loadFailed}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : courses.length === 0 ? (
        <p className="text-sm text-muted">{t.courses.empty}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <li key={course.id}>
              <CourseCard org={org.slug} course={course} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CourseCard({ org, course }: { org: string; course: CourseSummary }) {
  const t = useT();
  return (
    <Link
      to="/o/$org/courses/$courseId"
      params={{ org, courseId: course.id }}
      className="block h-full rounded-2xl border border-border bg-surface p-5 shadow-(--surface-shadow) transition-colors hover:border-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold tracking-tight">{course.title}</h3>
        {course.archivedAt && (
          <Chip size="sm" variant="secondary">
            {t.courses.archived}
          </Chip>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">{t.courses.academicYear(course.academicYear)}</p>
    </Link>
  );
}

function NewCourseForm({ org, courses, onCancel }: { org: string; courses: CourseSummary[]; onCancel: () => void }) {
  const create = useCreateCourse(org);
  const navigate = useNavigate();
  const t = useT();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const copyFrom = String(data.get('copyFrom') ?? '');
    const locale = data.get('locale');
    create.mutate(
      {
        title: String(data.get('title') ?? ''),
        academicYear: String(data.get('academicYear') ?? ''),
        locale: isLocale(locale) ? locale : null,
        ...(copyFrom ? { copyFromCourseId: copyFrom } : {}),
      },
      { onSuccess: (course) => navigate({ to: '/o/$org/courses/$courseId', params: { org, courseId: course.id } }) },
    );
  }

  return (
    <Form
      onSubmit={onSubmit}
      aria-label={t.courses.newCourse}
      className="mb-6 grid gap-4 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-2"
    >
      <TextField name="title" isRequired className="sm:col-span-2">
        <Label>{t.courses.titleLabel}</Label>
        <Input placeholder={t.courses.titlePlaceholder} autoFocus />
        <FieldError>{t.courses.titleMissing}</FieldError>
      </TextField>
      <TextField
        name="academicYear"
        isRequired
        defaultValue={currentAcademicYear()}
        validate={(value) => (/^\d{4}\/\d{2}$/.test(value) ? null : t.courses.yearFormat)}
      >
        <Label>{t.courses.yearLabel}</Label>
        <Input />
        <FieldError />
      </TextField>
      <div className="grid gap-1">
        <label htmlFor="copy-from" className="text-sm font-medium">
          {t.courses.copyFrom}
        </label>
        <select
          id="copy-from"
          name="copyFrom"
          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm"
          defaultValue=""
        >
          <option value="">{t.courses.copyNothing}</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title} ({course.academicYear})
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1">
        <label htmlFor="course-locale" className="text-sm font-medium">
          {t.courses.language}
        </label>
        <select
          id="course-locale"
          name="locale"
          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm"
          defaultValue=""
        >
          <option value="">{t.courses.languageDefault}</option>
          {LOCALES.filter((code) => code !== 'sq').map((code) => (
            <option key={code} value={code} lang={code}>
              {LANGUAGE_NAMES[code]}
            </option>
          ))}
        </select>
      </div>
      {create.isError && (
        <Alert status="danger" className="sm:col-span-2">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t.courses.createFailed}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <Button type="submit" variant="primary" isPending={create.isPending}>
          {t.courses.create}
        </Button>
        <Button variant="ghost" onPress={onCancel}>
          {t.common.cancel}
        </Button>
      </div>
    </Form>
  );
}

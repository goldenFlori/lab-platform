import { Alert, Button, ProgressBar } from '@heroui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ArrowLeft, FileUp, Printer, X } from 'lucide-react';
import { type ChangeEvent, useEffect, useState } from 'react';
import { parseNameList, usernameBase } from '../../../../../../../../../shared/student-names';
import { CredentialSlips } from '../../../../../../../../components/CredentialSlips';
import { HelpLink } from '../../../../../../../../components/HelpLink';
import { t as messages, useT } from '../../../../../../../../i18n';
import { ApiError } from '../../../../../../../../lib/api';
import { APP_NAME } from '../../../../../../../../lib/brand';
import { brandingQuery } from '../../../../../../../../lib/branding';
import { courseQuery } from '../../../../../../../../lib/courses';
import { importStudents, namesFromFile, type Slip } from '../../../../../../../../lib/students';

export const Route = createFileRoute('/_authed/o/$org/courses/$courseId/groups/$groupId/import')({
  loader: async ({ context, params }) => {
    try {
      const course = await context.queryClient.ensureQueryData(courseQuery(params.org, params.courseId));
      const group = course.groups.find((g) => g.id === params.groupId);
      if (!group?.permissions.manageStudents) throw notFound();
      return { courseTitle: course.course.title, groupName: group.name };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${messages().importStudents.title} · ${loaderData?.groupName ?? ''} · ${APP_NAME}` }],
  }),
  component: ImportPage,
});

type Phase = { step: 'input' } | { step: 'preview' } | { step: 'importing'; done: number } | { step: 'done' };

function ImportPage() {
  const { org, courseId, groupId } = Route.useParams();
  // The institution's name on the printed slips (#201).
  const institution = useQuery(brandingQuery(org)).data?.name;
  const { courseTitle, groupName } = Route.useLoaderData();
  const [text, setText] = useState('');
  // Each name gets an id, so the same name twice stays two rows.
  const [names, setNames] = useState<{ id: string; name: string }[]>([]);
  const [phase, setPhase] = useState<Phase>({ step: 'input' });
  const [slips, setSlips] = useState<Slip[]>([]);
  const [failedFrom, setFailedFrom] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [printed, setPrinted] = useState(false);
  const queryClient = useQueryClient();
  const t = useT();

  // The passwords exist only on this page: warn before leaving it unprinted.
  useEffect(() => {
    if (slips.length === 0 || printed) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [slips.length, printed]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const fromFile = await namesFromFile(file);
      setText(fromFile.join('\n'));
      setMessage(null);
    } catch {
      setMessage(t.importStudents.fileUnreadable);
    }
    event.target.value = '';
  }

  function toPreview() {
    const parsed = parseNameList(text);
    if (parsed.length === 0) return setMessage(t.importStudents.noNames);
    setMessage(null);
    setNames(parsed.map((name) => ({ id: crypto.randomUUID(), name })));
    setPhase({ step: 'preview' });
  }

  async function run(list: string[]) {
    setPhase({ step: 'importing', done: 0 });
    setFailedFrom(null);
    const already = slips.length;
    const result = await importStudents(org, courseId, groupId, list, (done) => setPhase({ step: 'importing', done }));
    setSlips((previous) => [...previous, ...result.slips]);
    // The group's student list has changed.
    await queryClient.invalidateQueries({ queryKey: ['orgs', org, 'courses', courseId, 'groups', groupId] });
    if (result.error) setFailedFrom(already + result.slips.length);
    setPhase({ step: 'done' });
  }

  const backToGroup = (
    <Link
      to="/o/$org/courses/$courseId/groups/$groupId"
      params={{ org, courseId, groupId }}
      className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> {groupName}
    </Link>
  );

  return (
    <section className="container-page py-10">
      {backToGroup}
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{t.importStudents.title}</h1>
      <p className="mt-1 text-muted">
        {courseTitle} · {groupName}
      </p>
      <HelpLink guide="students" className="mt-2" />

      {phase.step === 'input' && (
        <div className="mt-8 max-w-2xl">
          <label htmlFor="names" className="text-sm font-medium">
            {t.importStudents.list}
          </label>
          <textarea
            id="names"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={12}
            placeholder={t.importStudents.listPlaceholder}
            className="mt-1 block w-full rounded-2xl border border-border bg-surface p-4 font-mono text-sm"
          />
          <p className="mt-2 text-sm text-muted">{t.importStudents.listHelp}</p>
          {message && (
            <Alert status="danger" className="mt-4">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{message}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="primary" onPress={toPreview}>
              {t.importStudents.continue}
            </Button>
            <label className="button button--tertiary cursor-pointer gap-2">
              <FileUp className="size-4" /> {t.importStudents.upload}
              <input type="file" accept=".csv,.txt,.xlsx" className="sr-only" onChange={onFile} />
            </label>
          </div>
        </div>
      )}

      {phase.step === 'preview' && (
        <div className="mt-8 max-w-2xl">
          <p className="font-medium">{t.importStudents.check(names.length)}</p>
          <p className="mt-1 text-sm text-muted">{t.importStudents.usernameNote}</p>
          <ol className="mt-4 divide-y divide-separator rounded-2xl border border-border bg-surface">
            {names.map(({ id, name }, i) => (
              <li key={id} className="flex items-center gap-3 px-4 py-2">
                <span className="w-8 text-right text-sm text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <span className="hidden font-mono text-sm text-muted sm:inline">{usernameBase(name)}</span>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={t.importStudents.remove(name)}
                  onPress={() => setNames((list) => list.filter((entry) => entry.id !== id))}
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="primary" isDisabled={names.length === 0} onPress={() => run(names.map((n) => n.name))}>
              {t.importStudents.importN(names.length)}
            </Button>
            <Button variant="ghost" onPress={() => setPhase({ step: 'input' })}>
              {t.importStudents.editList}
            </Button>
          </div>
        </div>
      )}

      {phase.step === 'importing' && (
        <div className="mt-8 max-w-xl">
          <ProgressBar aria-label={t.importStudents.creating} value={phase.done} maxValue={names.length} />
          <p className="mt-3 text-sm text-muted">{t.importStudents.progress(phase.done, names.length)}</p>
        </div>
      )}

      {phase.step === 'done' && (
        <div className="mt-8">
          {slips.length > 0 && (
            <Alert status="accent">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{t.importStudents.added(slips.length, groupName)}</Alert.Title>
                <Alert.Description>{t.importStudents.addedNote}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          {failedFrom !== null && (
            <Alert status="danger" className="mt-4">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{t.importStudents.failed(names.length - failedFrom)}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            {slips.length > 0 && (
              <Button
                variant="primary"
                onPress={() => {
                  window.print();
                  setPrinted(true);
                }}
              >
                <Printer className="size-4" /> {t.importStudents.print}
              </Button>
            )}
            {failedFrom !== null && (
              <Button variant="secondary" onPress={() => run(names.slice(failedFrom).map((n) => n.name))}>
                {t.importStudents.retry}
              </Button>
            )}
          </div>
          <div className="mt-8">
            <CredentialSlips slips={slips} courseTitle={courseTitle} groupName={groupName} institution={institution} />
          </div>
        </div>
      )}
    </section>
  );
}

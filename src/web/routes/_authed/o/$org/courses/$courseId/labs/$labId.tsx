import { Alert, Chip } from '@heroui/react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound, useRouterState } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  ChevronRight,
  Download,
  FileText,
  KeyRound,
  Presentation,
  Sparkles,
} from 'lucide-react';
import { type ReactNode, type SyntheticEvent, useEffect, useMemo, useRef } from 'react';
import type { StoredNotebook } from '../../../../../../../../notebook/stored';
import type { GroupView } from '../../../../../../../../shared/courses';
import type { Exercise } from '../../../../../../../../shared/exercises';
import type { LabView } from '../../../../../../../../shared/labs';
import { ORIGINAL_FILE } from '../../../../../../../../shared/notebook-files';
import type { Embed, NotebookKind, NotebookSummary } from '../../../../../../../../shared/notebooks';
import { AiTools } from '../../../../../../../components/AiTools';
import { LabMoreMenu } from '../../../../../../../components/LabMoreMenu';
import { LiveLab } from '../../../../../../../components/LiveLab';
import { AssignmentsEditor } from '../../../../../../../components/notebook/AssignmentsEditor';
import { DeleteNotebook } from '../../../../../../../components/notebook/DeleteNotebook';
import { EditsBar } from '../../../../../../../components/notebook/EditsBar';
import { EmbedsEditor } from '../../../../../../../components/notebook/EmbedsEditor';
import { ExercisesEditor } from '../../../../../../../components/notebook/ExercisesEditor';
import { KolokiumCard } from '../../../../../../../components/notebook/KolokiumCard';
import { NotebookTranslate } from '../../../../../../../components/notebook/NotebookTranslate';
import { NotebookUpload } from '../../../../../../../components/notebook/NotebookUpload';
import { embedAnchor, NotebookView } from '../../../../../../../components/notebook/NotebookView';
import { PythonBar } from '../../../../../../../components/notebook/RunControls';
import { SubmissionBar } from '../../../../../../../components/notebook/SubmissionBar';
import { Toc } from '../../../../../../../components/notebook/Toc';
import type { VariantTarget } from '../../../../../../../components/notebook/VariantMaker';
import { t as messages, useT } from '../../../../../../../i18n';
import { reportRun, reportVisualizationUsed } from '../../../../../../../lib/activity';
import { ApiError } from '../../../../../../../lib/api';
import { APP_NAME } from '../../../../../../../lib/brand';
import { CodeEditsProvider, useCodeEdits } from '../../../../../../../lib/code-edits';
import { courseQuery } from '../../../../../../../lib/courses';
import { ExercisesProvider, useExercises } from '../../../../../../../lib/exercises';
import { labQuery, labsQuery } from '../../../../../../../lib/labs';
import { LiveProvider, useLive } from '../../../../../../../lib/live-context';
import {
  type NotebookRef,
  notebookFileUrl,
  notebookQuery,
  notebooksQuery,
  renderedQuery,
  useNotebookChanges,
} from '../../../../../../../lib/notebooks';
import { PythonProvider } from '../../../../../../../python/PythonProvider';

export const Route = createFileRoute('/_authed/o/$org/courses/$courseId/labs/$labId')({
  validateSearch: (search: Record<string, unknown>): { notebook?: string; live?: number } => ({
    notebook: typeof search.notebook === 'string' ? search.notebook : undefined,
    // From the Live Lab's QR code (#65): join the session at once.
    live: search.live === 1 || search.live === '1' ? 1 : undefined,
  }),
  loaderDeps: ({ search }) => ({ notebook: search.notebook }),
  loader: async ({ context: { queryClient }, params: { org, courseId, labId }, deps }) => {
    // The notebook's details and its rendering start with the rest, not after the page has rendered:
    // one round trip less, and the largest download sooner, on a slow network (#193). Not awaited:
    // a notebook the user may not open fails in its own place, as it would have.
    const notebook = (notebookId: string) => {
      const ref = { org, courseId, labId, notebookId };
      void queryClient.prefetchQuery(notebookQuery(ref));
      void queryClient.prefetchQuery(renderedQuery(ref));
    };
    if (deps.notebook) notebook(deps.notebook);
    try {
      const [lab, , list] = await Promise.all([
        queryClient.ensureQueryData(labQuery(org, courseId, labId)),
        queryClient.ensureQueryData(courseQuery(org, courseId)),
        queryClient.ensureQueryData(notebooksQuery(org, courseId, labId)),
        queryClient.ensureQueryData(labsQuery(org, courseId)),
      ]);
      // No notebook named: the one the page will show, as it chooses it.
      if (!deps.notebook) {
        const first = [...list.notebooks]
          .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.position - b.position)
          .find((nb) => nb.ready);
        if (first) notebook(first.id);
      }
      return { title: lab.title };
    } catch (error) {
      // Missing, hidden, or not ours to see: the same 404 page either way.
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.title ?? messages().lab.pageTitle} · ${APP_NAME}` }] }),
  component: LabPage,
});

const KIND_ORDER: Record<NotebookKind, number> = { main: 0, extra: 1, solution: 2 };
const KIND_ICON = { main: FileText, extra: BookMarked, solution: KeyRound } as const;

const labTag = (lab: LabView) => `LAB ${String(lab.n).padStart(2, '0')}`;

function LabPage() {
  const { org, courseId, labId } = Route.useParams();
  const { notebook: chosen, live } = Route.useSearch();
  const { data: lab } = useSuspenseQuery(labQuery(org, courseId, labId));
  const { data: courseDetail } = useSuspenseQuery(courseQuery(org, courseId));
  const { data: list } = useSuspenseQuery(notebooksQuery(org, courseId, labId));
  const { data: labList } = useSuspenseQuery(labsQuery(org, courseId));
  const canManage = labList.permissions.manage;
  const changes = useNotebookChanges(org, courseId, labId);
  const navigate = Route.useNavigate();
  const t = useT();

  const notebooks = [...list.notebooks].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.position - b.position,
  );
  // The chosen one, else the first finished notebook (staff also see unfinished uploads).
  const current = notebooks.find((nb) => nb.id === chosen) ?? notebooks.find((nb) => nb.ready) ?? notebooks[0];
  const ref: NotebookRef | null = current ? { org, courseId, labId, notebookId: current.id } : null;
  const detail = useQuery({ ...notebookQuery(ref ?? { org, courseId, labId, notebookId: '' }), enabled: !!ref });
  const firstEmbed = detail.data?.embeds[0];

  return (
    <LiveProvider
      org={org}
      courseId={courseId}
      labId={labId}
      autoJoin={live === 1}
      notebookId={current?.id ?? null}
      onNotebook={(id) => void navigate({ search: (s) => ({ ...s, notebook: id }), replace: true })}
    >
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-70"
          style={{
            background:
              'radial-gradient(60% 80% at 15% 0%, color-mix(in oklab, var(--brand) 22%, transparent), transparent 70%)',
          }}
          aria-hidden="true"
        />
        <section className="container-page relative pt-8 pb-4">
          <nav aria-label={t.lab.breadcrumb} className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
            <Link to="/o/$org/courses/$courseId" params={{ org, courseId }} className="truncate hover:text-foreground">
              {courseDetail.course.title}
            </Link>
            <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="shrink-0 text-foreground" aria-current="page">
              {t.labs.lab(lab.n)}
            </span>
          </nav>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand px-3 py-1 font-mono text-xs font-bold tracking-wider text-white">
              {labTag(lab)}
            </span>
            {lab.week && (
              <Chip size="sm" variant="secondary">
                {t.lab.week(lab.week)}
              </Chip>
            )}
            {lab.solutionsAvailable && notebooks.some((nb) => nb.kind === 'solution') && (
              <Chip size="sm" variant="soft" color="success">
                {t.labs.solutionsAvailable}
              </Chip>
            )}
          </div>
          <h1 className="mt-4 text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-[2.6rem]">
            {lab.title}
          </h1>
          {lab.summary && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">{lab.summary}</p>}

          {/* One toolbar (#130): what everyone uses, then the staff's tools, then the rest in "More". */}
          <div className="mt-7 flex flex-wrap items-center gap-2.5" data-testid="lab-toolbar">
            {ref && current?.ready && (
              <>
                <a href={notebookFileUrl(ref, ORIGINAL_FILE)} download className="button button--primary gap-2">
                  <Download className="size-4" aria-hidden="true" /> {t.lab.download}
                </a>
                <Link
                  to="/o/$org/courses/$courseId/labs/$labId/present"
                  params={{ org, courseId, labId }}
                  search={{ notebook: ref.notebookId }}
                  // Fullscreen needs the click itself, so it starts here rather than on the next page.
                  onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
                  className="button button--secondary gap-2"
                >
                  <Presentation className="size-4" aria-hidden="true" /> {t.lab.present}
                </Link>
                {firstEmbed && (
                  <a
                    href={`#${embedAnchor(ref.notebookId, firstEmbed.cell)}`}
                    className="button button--tertiary gap-2 max-sm:hidden"
                  >
                    <Sparkles className="size-4" aria-hidden="true" /> {t.lab.firstVisualization}
                  </a>
                )}
              </>
            )}
            {canManage && <AiTools org={org} courseId={courseId} />}
            {canManage && <LabMoreMenu canDelete={!!current} />}
            <LiveLab org={org} courseId={courseId} labId={labId} />
          </div>

          {canManage && (
            <div className="flex flex-wrap items-start gap-2.5 empty:hidden [&:has(>*)]:mt-5">
              <NotebookUpload
                withButton={false}
                base={changes.base}
                hasMain={notebooks.some((nb) => nb.kind === 'main')}
                onUploaded={async (nb) => {
                  await changes.uploaded(nb);
                  await navigate({ search: { notebook: nb.id } });
                }}
              />
              {current?.ready && (
                <NotebookTranslate
                  key={current.id}
                  withButton={false}
                  org={org}
                  courseId={courseId}
                  base={changes.base}
                  notebook={current}
                  onSaved={async (nb) => {
                    await changes.uploaded(nb);
                    await navigate({ search: { notebook: nb.id } });
                  }}
                />
              )}
              {current && (
                <DeleteNotebook
                  withButton={false}
                  title={current.title}
                  isPending={changes.deleteNotebook.isPending}
                  onDelete={() =>
                    changes.deleteNotebook.mutate(current.id, { onSuccess: () => navigate({ search: {} }) })
                  }
                />
              )}
            </div>
          )}

          {lab.kolokia?.map((kolokium) => (
            <KolokiumCard
              key={kolokium.notebookId}
              kolokium={kolokium}
              org={org}
              courseId={courseId}
              labId={labId}
              current={current?.id === kolokium.notebookId}
              onNotebook={() => void navigate({ search: (s) => ({ ...s, notebook: kolokium.notebookId }) })}
            />
          ))}

          {notebooks.length > 1 && current && (
            <nav aria-label={t.lab.notebooks} className="mt-8">
              <ul className="flex flex-wrap gap-2">
                {notebooks.map((nb) => (
                  // Capped at the row's width, so a long title shortens with "…" on a phone.
                  <li key={nb.id} className="max-w-full">
                    <NotebookTab nb={nb} current={nb.id === current.id} />
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </section>
      </div>

      <section className="container-page relative mt-6 pb-16">
        {!current || !ref ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
            <FileText className="size-8 text-muted" aria-hidden="true" />
            <p className="mt-3 text-sm text-muted">{t.lab.noNotebooks}</p>
          </div>
        ) : !current.ready ? (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{t.lab.unfinished}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : (
          <NotebookSection
            notebookRef={ref}
            embeds={detail.data?.embeds}
            exercises={detail.data?.exercises}
            embedsFailed={detail.isError}
            editor={
              canManage
                ? {
                    isPending: changes.saveEmbeds.isPending,
                    save: (embeds) => changes.saveEmbeds.mutateAsync({ notebookId: ref.notebookId, embeds }),
                    exercisesPending: changes.saveExercises.isPending,
                    saveExercises: (exercises) =>
                      changes.saveExercises.mutateAsync({ notebookId: ref.notebookId, exercises }),
                    variants: {
                      org,
                      courseId,
                      base: changes.base,
                      onSaved: async (nb) => {
                        await changes.uploaded(nb);
                        await navigate({ search: { notebook: nb.id } });
                      },
                    },
                  }
                : null
            }
            onVisualizationUsed={
              labList.permissions.staff ? undefined : () => reportVisualizationUsed(org, courseId, labId)
            }
            submissions={
              labList.permissions.staff
                ? { staff: { groups: courseDetail.groups, canPublish: labList.permissions.publish } }
                : { staff: null }
            }
          />
        )}
        <LabNeighbours org={org} courseId={courseId} labId={labId} labs={labList.labs} />
      </section>
    </LiveProvider>
  );
}

function NotebookTab({ nb, current }: { nb: NotebookSummary; current: boolean }) {
  const Icon = KIND_ICON[nb.kind];
  const t = useT();
  return (
    <Link
      from={Route.fullPath}
      search={{ notebook: nb.id }}
      aria-current={current ? 'page' : undefined}
      className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
        current
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-border bg-surface text-foreground/80 hover:border-accent/50 hover:text-foreground'
      }`}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">
        {nb.kind === 'solution' ? t.lab.solutionTab(nb.title) : nb.title}
        {nb.ready ? '' : t.lab.unfinishedTab}
      </span>
    </Link>
  );
}

function NotebookSection({
  notebookRef,
  embeds,
  exercises,
  embedsFailed,
  editor,
  onVisualizationUsed,
  submissions,
}: {
  notebookRef: NotebookRef;
  embeds: Embed[] | undefined;
  exercises: Exercise[] | undefined;
  embedsFailed: boolean;
  /** Staff who manage the course: where the visualizations go, and the exercises (#51). */
  editor: {
    isPending: boolean;
    save: (embeds: Embed[]) => Promise<unknown>;
    exercisesPending: boolean;
    saveExercises: (exercises: Exercise[]) => Promise<unknown>;
    variants: VariantTarget;
  } | null;
  /** Students: told the first time they use a visualization of this notebook (#18). */
  onVisualizationUsed?: () => void;
  /** Handing in work (#52): staff open it per group; students hand in. */
  submissions: { staff: { groups: GroupView[]; canPublish: boolean } | null };
}) {
  const rendered = useQuery(renderedQuery(notebookRef));
  const reported = useRef<string | null>(null);
  const used = (event: SyntheticEvent) => {
    if (!onVisualizationUsed || reported.current === notebookRef.notebookId) return;
    if (!(event.target instanceof Element) || !event.target.closest('[data-viz-id]')) return;
    reported.current = notebookRef.notebookId;
    onVisualizationUsed();
  };
  const ready = Boolean(rendered.data && embeds);
  // The original code of each code cell, for telling a student's edit from the original (#49).
  const originals = useMemo(
    () =>
      new Map(
        (rendered.data?.cells ?? []).flatMap((cell) =>
          cell.type === 'code' ? [[cell.srcIndex, cell.raw] as const] : [],
        ),
      ),
    [rendered.data],
  );
  const t = useT();
  const hash = useRouterState({ select: (state) => state.location.hash });

  // A link to a section (from search, or shared) lands on it once the notebook has rendered.
  useEffect(() => {
    if (ready && hash) document.getElementById(decodeURIComponent(hash))?.scrollIntoView({ block: 'start' });
  }, [ready, hash]);

  if (rendered.isError || embedsFailed) {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{t.lab.loadFailed}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  if (!rendered.data || !embeds || !exercises) {
    return (
      <p className="py-10 text-sm text-muted" aria-busy="true">
        {t.lab.loadingNotebook}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_14rem]">
      {/* Capturing, so a visualization that handles its own keys or clicks is still noticed. */}
      <article className="min-w-0" onPointerDownCapture={used} onKeyDownCapture={used}>
        {submissions.staff && (
          <div className="mb-3">
            <AssignmentsEditor
              key={`assignments-${notebookRef.notebookId}`}
              notebookRef={notebookRef}
              groups={submissions.staff.groups}
              canPublish={submissions.staff.canPublish}
            />
          </div>
        )}
        {editor && (
          <div className="mb-8 grid gap-3">
            <EmbedsEditor
              key={notebookRef.notebookId}
              notebook={rendered.data}
              embeds={embeds}
              isPending={editor.isPending}
              onSave={editor.save}
            />
            <ExercisesEditor
              key={`exercises-${notebookRef.notebookId}`}
              notebook={rendered.data}
              exercises={exercises}
              isPending={editor.exercisesPending}
              onSave={editor.saveExercises}
              variants={editor.variants}
            />
          </div>
        )}
        <ExercisesProvider notebookRef={notebookRef} exercises={exercises}>
          <CodeEditsProvider notebookRef={notebookRef} originals={originals}>
            <EditablePython notebookId={notebookRef.notebookId} notebook={rendered.data}>
              {!submissions.staff && <SubmissionBar notebookRef={notebookRef} />}
              <EditsBar />
              <PythonBar />
              <NotebookView
                id={notebookRef.notebookId}
                notebook={rendered.data}
                embeds={embeds}
                fileUrl={(name) => notebookFileUrl(notebookRef, name)}
              />
            </EditablePython>
          </CodeEditsProvider>
        </ExercisesProvider>
      </article>
      <aside className="hidden lg:block">
        <Toc entries={rendered.data.toc} />
      </aside>
    </div>
  );
}

/** The previous and next labs this user may see. */
function LabNeighbours({
  org,
  courseId,
  labId,
  labs,
}: {
  org: string;
  courseId: string;
  labId: string;
  labs: LabView[];
}) {
  const t = useT();
  const i = labs.findIndex((lab) => lab.id === labId);
  if (i < 0) return null;
  const previous = labs[i - 1];
  const next = labs[i + 1];
  if (!previous && !next) return null;
  const card =
    'group block rounded-3xl border border-border bg-surface p-5 shadow-surface transition-colors hover:border-accent/50';
  return (
    <nav className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label={t.lab.otherLabs}>
      {previous ? (
        <Link
          to="/o/$org/courses/$courseId/labs/$labId"
          params={{ org, courseId, labId: previous.id }}
          className={card}
        >
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-1" aria-hidden="true" />{' '}
            {t.labs.lab(previous.n)}
          </span>
          <span className="mt-1.5 block font-semibold tracking-tight">{previous.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          to="/o/$org/courses/$courseId/labs/$labId"
          params={{ org, courseId, labId: next.id }}
          className={`${card} text-right`}
        >
          <span className="flex items-center justify-end gap-1.5 text-xs text-muted">
            {t.labs.lab(next.n)}{' '}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </span>
          <span className="mt-1.5 block font-semibold tracking-tight">{next.title}</span>
        </Link>
      )}
    </nav>
  );
}

/**
 * The notebook's Python, running each student's own version of the code where they changed it. An
 * exercise's run checks it, and a check that passes is kept (#51).
 */
function EditablePython({
  notebookId,
  notebook,
  children,
}: {
  notebookId: string;
  notebook: StoredNotebook;
  children: ReactNode;
}) {
  const edits = useCodeEdits();
  const exercises = useExercises();
  const live = useLive();
  return (
    <PythonProvider
      notebookId={notebookId}
      notebook={notebook}
      codeFor={(cell) => edits?.code(cell) ?? cell.raw}
      checkFor={(cell) => {
        const exercise = exercises?.of(cell);
        return exercise ? { test: exercise.test } : undefined;
      }}
      onRun={(cell, run, ms) => {
        const ref = exercises?.notebookRef;
        if (ref) reportRun(ref.org, ref.courseId, ref.labId);
        const outcome = run.outcome;
        if (outcome?.kind === 'ok' && outcome.check?.status === 'pass') exercises?.passed(cell);
        // In a live challenge, only the result goes to the room (#67).
        if (!outcome || outcome.kind === 'interrupted' || !exercises?.of(cell)) return;
        const check = outcome.kind === 'ok' ? outcome.check : undefined;
        const status = check?.status ?? 'error';
        const message = check
          ? check.message
          : outcome.kind === 'error'
            ? (outcome.traceback.trim().split('\n').at(-1) ?? '')
            : '';
        const error = status === 'error' ? (/^([A-Za-z_][\w.]*)/.exec(message)?.[1] ?? null) : null;
        live?.report({ cell: cell.srcIndex, status, error, ms });
      }}
    >
      {children}
    </PythonProvider>
  );
}

import { Alert, Chip } from '@heroui/react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, BookMarked, ChevronRight, Download, FileText, KeyRound, Sparkles } from 'lucide-react';
import type { LabView } from '../../../../../../../../shared/labs';
import { ORIGINAL_FILE } from '../../../../../../../../shared/notebook-files';
import type { Embed, NotebookKind, NotebookSummary } from '../../../../../../../../shared/notebooks';
import { DeleteNotebook } from '../../../../../../../components/notebook/DeleteNotebook';
import { EmbedsEditor } from '../../../../../../../components/notebook/EmbedsEditor';
import { NotebookUpload } from '../../../../../../../components/notebook/NotebookUpload';
import { embedAnchor, NotebookView } from '../../../../../../../components/notebook/NotebookView';
import { Toc } from '../../../../../../../components/notebook/Toc';
import { ApiError } from '../../../../../../../lib/api';
import { APP_NAME } from '../../../../../../../lib/brand';
import { courseQuery } from '../../../../../../../lib/courses';
import { labQuery, labsQuery } from '../../../../../../../lib/labs';
import {
  type NotebookRef,
  notebookFileUrl,
  notebookQuery,
  notebooksQuery,
  renderedQuery,
  useNotebookChanges,
} from '../../../../../../../lib/notebooks';

export const Route = createFileRoute('/_authed/o/$org/courses/$courseId/labs/$labId')({
  validateSearch: (search: Record<string, unknown>): { notebook?: string } => ({
    notebook: typeof search.notebook === 'string' ? search.notebook : undefined,
  }),
  loader: async ({ context: { queryClient }, params: { org, courseId, labId } }) => {
    try {
      const [lab] = await Promise.all([
        queryClient.ensureQueryData(labQuery(org, courseId, labId)),
        queryClient.ensureQueryData(courseQuery(org, courseId)),
        queryClient.ensureQueryData(notebooksQuery(org, courseId, labId)),
        queryClient.ensureQueryData(labsQuery(org, courseId)),
      ]);
      return { title: lab.title };
    } catch (error) {
      // Missing, hidden, or not ours to see: the same 404 page either way.
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.title ?? 'Laboratori'} · ${APP_NAME}` }] }),
  component: LabPage,
});

const KIND_ORDER: Record<NotebookKind, number> = { main: 0, extra: 1, solution: 2 };
const KIND_ICON = { main: FileText, extra: BookMarked, solution: KeyRound } as const;

const labTag = (lab: LabView) => `LAB ${String(lab.n).padStart(2, '0')}`;

function LabPage() {
  const { org, courseId, labId } = Route.useParams();
  const { notebook: chosen } = Route.useSearch();
  const { data: lab } = useSuspenseQuery(labQuery(org, courseId, labId));
  const { data: courseDetail } = useSuspenseQuery(courseQuery(org, courseId));
  const { data: list } = useSuspenseQuery(notebooksQuery(org, courseId, labId));
  const { data: labList } = useSuspenseQuery(labsQuery(org, courseId));
  const canManage = labList.permissions.manage;
  const changes = useNotebookChanges(org, courseId, labId);
  const navigate = Route.useNavigate();

  const notebooks = [...list.notebooks].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.position - b.position,
  );
  // The chosen one, else the first finished notebook (staff also see unfinished uploads).
  const current = notebooks.find((nb) => nb.id === chosen) ?? notebooks.find((nb) => nb.ready) ?? notebooks[0];
  const ref: NotebookRef | null = current ? { org, courseId, labId, notebookId: current.id } : null;
  const detail = useQuery({ ...notebookQuery(ref ?? { org, courseId, labId, notebookId: '' }), enabled: !!ref });
  const firstEmbed = detail.data?.embeds[0];

  return (
    <>
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
          <nav aria-label="Rruga" className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
            <Link to="/o/$org/courses/$courseId" params={{ org, courseId }} className="truncate hover:text-foreground">
              {courseDetail.course.title}
            </Link>
            <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="shrink-0 text-foreground" aria-current="page">
              Laboratori {lab.n}
            </span>
          </nav>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand px-3 py-1 font-mono text-xs font-bold tracking-wider text-white">
              {labTag(lab)}
            </span>
            {lab.week && (
              <Chip size="sm" variant="secondary">
                Java {lab.week}
              </Chip>
            )}
            {lab.solutionsAvailable && notebooks.some((nb) => nb.kind === 'solution') && (
              <Chip size="sm" variant="soft" color="success">
                Zgjidhjet janë të disponueshme
              </Chip>
            )}
          </div>
          <h1 className="mt-4 text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-[2.6rem]">
            {lab.title}
          </h1>
          {lab.summary && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">{lab.summary}</p>}

          {ref && current?.ready && (
            <div className="mt-7 flex flex-wrap gap-2.5">
              <a href={notebookFileUrl(ref, ORIGINAL_FILE)} download className="button button--primary gap-2">
                <Download className="size-4" aria-hidden="true" /> Shkarko fletoren
              </a>
              {firstEmbed && (
                <a href={`#${embedAnchor(ref.notebookId, firstEmbed.cell)}`} className="button button--tertiary gap-2">
                  <Sparkles className="size-4" aria-hidden="true" /> Te vizualizimi i parë
                </a>
              )}
            </div>
          )}

          {canManage && (
            <div className="mt-7 flex flex-wrap items-start gap-2.5">
              <NotebookUpload
                base={changes.base}
                hasMain={notebooks.some((nb) => nb.kind === 'main')}
                onUploaded={async (nb) => {
                  await changes.uploaded(nb);
                  await navigate({ search: { notebook: nb.id } });
                }}
              />
              {current && (
                <DeleteNotebook
                  title={current.title}
                  isPending={changes.deleteNotebook.isPending}
                  onDelete={() =>
                    changes.deleteNotebook.mutate(current.id, { onSuccess: () => navigate({ search: {} }) })
                  }
                />
              )}
            </div>
          )}

          {notebooks.length > 1 && current && (
            <nav aria-label="Fletoret e laboratorit" className="mt-8">
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
            <p className="mt-3 text-sm text-muted">Ky laborator nuk ka ende fletore.</p>
          </div>
        ) : !current.ready ? (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>
                Ngarkimi i kësaj fletoreje nuk ka përfunduar. Studentët nuk e shohin derisa të përfundojë.
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : (
          <NotebookSection
            notebookRef={ref}
            embeds={detail.data?.embeds}
            embedsFailed={detail.isError}
            editor={
              canManage
                ? {
                    isPending: changes.saveEmbeds.isPending,
                    save: (embeds) => changes.saveEmbeds.mutateAsync({ notebookId: ref.notebookId, embeds }),
                  }
                : null
            }
          />
        )}
        <LabNeighbours org={org} courseId={courseId} labId={labId} labs={labList.labs} />
      </section>
    </>
  );
}

function NotebookTab({ nb, current }: { nb: NotebookSummary; current: boolean }) {
  const Icon = KIND_ICON[nb.kind];
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
        {nb.kind === 'solution' ? `Zgjidhja · ${nb.title}` : nb.title}
        {nb.ready ? '' : ' · pa përfunduar'}
      </span>
    </Link>
  );
}

function NotebookSection({
  notebookRef,
  embeds,
  embedsFailed,
  editor,
}: {
  notebookRef: NotebookRef;
  embeds: Embed[] | undefined;
  embedsFailed: boolean;
  /** Staff who manage the course: where the visualizations go. */
  editor: { isPending: boolean; save: (embeds: Embed[]) => Promise<unknown> } | null;
}) {
  const rendered = useQuery(renderedQuery(notebookRef));

  if (rendered.isError || embedsFailed) {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>Fletorja nuk u ngarkua. Rifreskoni faqen dhe provoni sërish.</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  if (!rendered.data || !embeds) {
    return (
      <p className="py-10 text-sm text-muted" aria-busy="true">
        Duke ngarkuar fletoren…
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_14rem]">
      <article className="min-w-0">
        {editor && (
          <div className="mb-8">
            <EmbedsEditor
              key={notebookRef.notebookId}
              notebook={rendered.data}
              embeds={embeds}
              isPending={editor.isPending}
              onSave={editor.save}
            />
          </div>
        )}
        <NotebookView
          id={notebookRef.notebookId}
          notebook={rendered.data}
          embeds={embeds}
          fileUrl={(name) => notebookFileUrl(notebookRef, name)}
        />
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
  const i = labs.findIndex((lab) => lab.id === labId);
  if (i < 0) return null;
  const previous = labs[i - 1];
  const next = labs[i + 1];
  if (!previous && !next) return null;
  const card =
    'group block rounded-3xl border border-border bg-surface p-5 shadow-surface transition-colors hover:border-accent/50';
  return (
    <nav className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Laboratorët e tjerë">
      {previous ? (
        <Link
          to="/o/$org/courses/$courseId/labs/$labId"
          params={{ org, courseId, labId: previous.id }}
          className={card}
        >
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-1" aria-hidden="true" />{' '}
            Laboratori {previous.n}
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
            Laboratori {next.n}{' '}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </span>
          <span className="mt-1.5 block font-semibold tracking-tight">{next.title}</span>
        </Link>
      )}
    </nav>
  );
}

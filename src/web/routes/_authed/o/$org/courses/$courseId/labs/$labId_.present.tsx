import { Button } from '@heroui/react';
import { useQueries, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { Eye, KeyRound, Maximize2, Minimize2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isSolutionOf, type Slide, slidesOf } from '../../../../../../../../notebook/slides';
import type { Cell } from '../../../../../../../../notebook/types';
import { isVisualizerId } from '../../../../../../../../shared/visualizers';
import { CodeCell } from '../../../../../../../components/notebook/CodeCell';
import { Markdown, SECTION_KINDS, sectionLabel } from '../../../../../../../components/notebook/NotebookView';
import { Output } from '../../../../../../../components/notebook/Output';
import { VizEmbed } from '../../../../../../../components/VizEmbed';
import { t as messages, useT } from '../../../../../../../i18n';
import { ApiError } from '../../../../../../../lib/api';
import { APP_NAME } from '../../../../../../../lib/brand';
import { labQuery } from '../../../../../../../lib/labs';
import {
  type NotebookRef,
  notebookFileUrl,
  notebookQuery,
  notebooksQuery,
  renderedQuery,
} from '../../../../../../../lib/notebooks';

// Presentation mode (#15): a lab's notebook in class, fullscreen, one step at a time, keyboard first.

export const Route = createFileRoute('/_authed/o/$org/courses/$courseId/labs/$labId_/present')({
  validateSearch: (search: Record<string, unknown>): { notebook?: string; step?: number } => ({
    notebook: typeof search.notebook === 'string' ? search.notebook : undefined,
    step: Number.isInteger(search.step) && (search.step as number) > 0 ? (search.step as number) : undefined,
  }),
  loader: async ({ context: { queryClient }, params: { org, courseId, labId } }) => {
    try {
      const [lab] = await Promise.all([
        queryClient.ensureQueryData(labQuery(org, courseId, labId)),
        queryClient.ensureQueryData(notebooksQuery(org, courseId, labId)),
      ]);
      return { title: lab.title };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${messages().present.pageTitle} · ${loaderData?.title ?? messages().lab.pageTitle} · ${APP_NAME}`,
      },
    ],
  }),
  component: Presenter,
});

function Presenter() {
  const { org, courseId, labId } = Route.useParams();
  const { notebook: chosen, step = 0 } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: lab } = useSuspenseQuery(labQuery(org, courseId, labId));
  const { data: list } = useSuspenseQuery(notebooksQuery(org, courseId, labId));
  const t = useT();
  const ready = list.notebooks.filter((nb) => nb.ready);
  const current = ready.find((nb) => nb.id === chosen) ?? ready.find((nb) => nb.kind === 'main') ?? ready[0];
  const ref: NotebookRef = { org, courseId, labId, notebookId: current?.id ?? '' };

  const detail = useQuery({ ...notebookQuery(ref), enabled: !!current });
  const rendered = useQuery({ ...renderedQuery(ref), enabled: !!current });
  // A solution notebook of this lab made from this notebook, if this user may see one.
  const solutionNotebooks = ready.filter((nb) => nb.kind === 'solution' && nb.id !== current?.id);
  const candidates = useQueries({
    queries: solutionNotebooks.map((nb) => renderedQuery({ ...ref, notebookId: nb.id })),
  });
  const notebook = rendered.data;
  const match = notebook
    ? solutionNotebooks
        .map((nb, i) => ({ id: nb.id, data: candidates[i]?.data }))
        .find((candidate) => candidate.data !== undefined && isSolutionOf(candidate.data, notebook))
    : undefined;
  const solution = match?.data;

  const slides = useMemo(
    () => (notebook && detail.data ? slidesOf(notebook, detail.data.embeds) : []),
    [notebook, detail.data],
  );
  const last = Math.max(0, slides.length - 1);
  const index = Math.min(step, last);
  const slide = slides[index];
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());
  const [solved, setSolved] = useState(false);
  const showSolution = solved && solution !== undefined;
  const code = slide?.kind === 'code' ? (showSolution ? solution?.cells[slide.at] : slide.cell) : undefined;
  const outputs = code?.type === 'code' ? code.outputs : [];
  const isRevealed = revealed.has(index);

  const go = useCallback(
    (to: number) => navigate({ search: (s) => ({ ...s, step: to > 0 ? to : undefined }), replace: true }),
    [navigate],
  );
  const toggleReveal = useCallback(() => {
    if (outputs.length === 0) return;
    setRevealed((set) => {
      const next = new Set(set);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, [outputs.length, index]);
  // → shows a step's output first, like a slide that builds, then moves on.
  const forward = useCallback(() => {
    if (outputs.length > 0 && !revealed.has(index)) toggleReveal();
    else if (index < last) go(index + 1);
  }, [outputs.length, revealed, index, last, toggleReveal, go]);

  const stage = useRef<HTMLDivElement>(null);

  // Leaving: back to the lab, at the same notebook. Fullscreen ends with it.
  const fullscreenOnly = useRef(false);
  const leave = useCallback(() => {
    void navigate({
      to: '/o/$org/courses/$courseId/labs/$labId',
      params: { org, courseId, labId },
      search: current ? { notebook: current.id } : {},
    });
  }, [navigate, org, courseId, labId, current]);
  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else leave();
  }, [leave]);
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => {
      const on = !!document.fullscreenElement;
      setFullscreen(on);
      // The browser's Esc ends fullscreen without a key event reaching the page: treat it as leaving.
      if (!on && !fullscreenOnly.current) leave();
      fullscreenOnly.current = false;
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [leave]);
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen();
    },
    [],
  );
  const toggleFullscreen = () => {
    fullscreenOnly.current = true;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      // Inside a visualization its own keys apply; Esc hands the keyboard back to the slides.
      if (target?.closest('[data-viz]')) {
        if (event.key === 'Escape') {
          target.blur();
          stage.current?.focus();
        }
        return;
      }
      if ((event.key === ' ' || event.key === 'Enter') && target?.closest('button, a, summary')) return;
      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
          forward();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          if (index > 0) go(index - 1);
          break;
        case ' ':
          toggleReveal();
          break;
        case 'Home':
          go(0);
          break;
        case 'End':
          go(last);
          break;
        case 's':
        case 'S':
          if (solution) setSolved((on) => !on);
          break;
        case 'Escape':
          exit();
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [forward, go, index, last, toggleReveal, solution, exit]);

  // Each step starts at its top, with the keyboard on the stage (so ↑ and ↓ scroll long code).
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each new step
  useEffect(() => {
    stage.current?.scrollTo({ top: 0 });
    stage.current?.focus({ preventScroll: true });
  }, [index]);

  // An output just shown comes into view, even below long code; one already shown when coming back does not.
  const outputsRef = useRef<HTMLDivElement>(null);
  const shownAt = useRef({ index, isRevealed });
  useEffect(() => {
    const before = shownAt.current;
    shownAt.current = { index, isRevealed };
    if (before.index === index && !before.isRevealed && isRevealed) {
      outputsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [index, isRevealed]);

  // The solution's images and figures are its own files.
  const fileUrl = (name: string) =>
    notebookFileUrl(showSolution && match ? { ...ref, notebookId: match.id } : ref, name);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.present.dialog(lab.title)}
      className="presentation fixed inset-0 z-[70] flex flex-col bg-background text-foreground"
    >
      <header className="flex items-center gap-3 border-b border-separator px-4 py-2.5 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{lab.title}</p>
          {current && <p className="truncate text-xs text-muted">{current.title}</p>}
        </div>
        {slides.length > 0 && (
          <span
            data-testid="presentation-step"
            className="shrink-0 font-mono text-sm text-muted tabular-nums"
            aria-live="polite"
          >
            {index + 1} / {slides.length}
          </span>
        )}
        {solution && (
          <Button
            size="sm"
            variant={showSolution ? 'primary' : 'secondary'}
            aria-label={t.present.solution}
            aria-pressed={showSolution}
            onPress={() => setSolved((on) => !on)}
          >
            <KeyRound className="size-4" /> <span className="hidden sm:inline">{t.present.solution}</span>
          </Button>
        )}
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={fullscreen ? t.present.exitFullscreen : t.present.fullscreen}
          onPress={toggleFullscreen}
        >
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
        <Button isIconOnly size="sm" variant="ghost" aria-label={t.present.exit} onPress={exit}>
          <X className="size-4" />
        </Button>
      </header>

      <div ref={stage} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
        <div className={`mx-auto px-4 py-8 sm:px-8 sm:py-12 ${slide?.kind === 'viz' ? 'max-w-6xl' : 'max-w-5xl'}`}>
          {!current ? (
            <Empty text={t.present.nothing} org={org} courseId={courseId} labId={labId} />
          ) : rendered.isError || detail.isError ? (
            <Empty text={t.present.loadFailed} org={org} courseId={courseId} labId={labId} />
          ) : !slide ? (
            <p className="text-muted" aria-busy="true">
              {t.present.loading}
            </p>
          ) : (
            <Step slide={slide} code={code} fileUrl={fileUrl} />
          )}
          {code?.type === 'code' && outputs.length > 0 && (
            <div ref={outputsRef} className="mt-6 flex scroll-mt-4 flex-col gap-3">
              {isRevealed ? (
                outputs.map((out, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a cell's outputs are fixed; i is their order
                  <Output key={`${index}-${showSolution}-${i}`} out={out} fileUrl={fileUrl} />
                ))
              ) : (
                <button
                  type="button"
                  onClick={toggleReveal}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-6 text-muted transition-colors hover:border-accent/50 hover:text-foreground"
                >
                  <Eye className="size-5" aria-hidden="true" /> {t.present.reveal}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-separator">
        <div className="h-1 bg-surface-secondary" aria-hidden="true">
          <div
            className="h-full bg-accent transition-[width]"
            style={{ width: slides.length ? `${((index + 1) / slides.length) * 100}%` : 0 }}
          />
        </div>
        <p className="hidden px-6 py-2 text-xs text-muted sm:block">{t.present.keys(Boolean(solution))}</p>
      </footer>
    </div>
  );
}

function Step({ slide, code, fileUrl }: { slide: Slide; code: Cell | undefined; fileUrl: (name: string) => string }) {
  const t = useT();
  if (slide.kind === 'text') {
    const { cell } = slide;
    if (cell.html.trim() || !cell.heading) {
      // Its headings grow with the larger text (see .notebook-step in styles.css).
      return (
        <div className="notebook-step">
          <Markdown cell={cell} />
        </div>
      );
    }
    // A cell that only opens a section: a title slide.
    const meta = SECTION_KINDS[cell.kind];
    const Icon = meta?.icon;
    return (
      <div className="grid min-h-[55vh] place-content-center text-center">
        {meta && Icon && (
          <p
            className="mb-4 flex items-center justify-center gap-2 text-sm font-semibold tracking-wider uppercase sm:text-base"
            style={{ color: meta.color }}
          >
            <Icon className="size-5" aria-hidden="true" /> {sectionLabel(t, cell.kind)}
          </p>
        )}
        <h2 className="text-4xl leading-tight font-extrabold tracking-tight text-balance sm:text-6xl">
          {cell.heading}
        </h2>
      </div>
    );
  }
  if (slide.kind === 'viz') {
    return isVisualizerId(slide.embed.viz) ? (
      <VizEmbed key={slide.at} viz={slide.embed.viz} props={slide.embed.props} label={slide.embed.title} />
    ) : null;
  }
  return code?.type === 'code' ? <CodeCell cell={code} fileUrl={fileUrl} presenting /> : null;
}

function Empty({ text, org, courseId, labId }: { text: string; org: string; courseId: string; labId: string }) {
  const t = useT();
  return (
    <div className="grid place-items-center gap-4 py-16 text-center">
      <p className="text-muted">{text}</p>
      <Link
        to="/o/$org/courses/$courseId/labs/$labId"
        params={{ org, courseId, labId }}
        className="button button--secondary"
      >
        {t.present.back}
      </Link>
    </div>
  );
}

import { Chip } from '@heroui/react';
import {
  Check,
  ChevronDown,
  CircleCheck,
  ClipboardCheck,
  Code2,
  Copy,
  MonitorSmartphone,
  Pencil,
  RotateCcw,
  Users,
} from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import type { CodeCell as Cell } from '../../../notebook/types';
import { useT } from '../../i18n';
import { useCodeEdits } from '../../lib/code-edits';
import { useExercises } from '../../lib/exercises';
import { sanitize } from '../../lib/sanitize';
import { usePython } from '../../python/PythonProvider';
import { Output } from './Output';
import { RunButtons, useRunOutput } from './RunControls';

// Loaded the first time someone edits a cell (#49).
const CodeEditor = lazy(() => import('./CodeEditor'));

/**
 * One code cell. Short code shows in full and long code folds away. Code that opens a desktop window
 * (Pygame, Tkinter) or needs a live Jupyter kernel folds completely; its interactive version, if the
 * notebook has one, is shown just above it.
 */
export function CodeCell({
  cell,
  fileUrl,
  presenting = false,
}: {
  cell: Cell;
  fileUrl: (name: string) => string;
  /** Presentation mode: long code is shown in full, and the outputs are left to the presenter. */
  presenting?: boolean;
}) {
  const t = useT();
  const edits = useCodeEdits();
  const runnable = usePython()?.cells.get(cell);
  const [editing, setEditing] = useState(false);
  // On the lab page, a cell that can run can be edited; the student's own version replaces it.
  const editable = !presenting && edits !== null && runnable !== undefined;
  const edited = editable && edits.edited(cell);
  const editorOpen = editable && (editing || edited);
  const code = (
    <div
      className="nb-shiki"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized; the converter's highlighted code
      dangerouslySetInnerHTML={{ __html: sanitize(cell.html) }}
    />
  );

  if (cell.interactive) {
    const f = cell.flags;
    const library = f.pygame
      ? 'Pygame'
      : f.tkinter
        ? 'Tkinter'
        : f.widgets
          ? 'Jupyter widgets'
          : f.subprocess
            ? t.notebook.desktopProgram
            : '';
    return (
      <details className="group rounded-2xl border border-dashed border-border bg-surface-secondary/50">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-default text-muted">
            <MonitorSmartphone className="size-[18px]" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t.notebook.exerciseCode}</span>
            <span className="block text-xs text-muted">
              {library ? `${library} · ` : ''}
              {t.notebook.windowLines(cell.lines)}
            </span>
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="relative border-t border-dashed border-border">
          <div className="absolute top-2.5 right-2.5 z-10">
            <CopyButton text={cell.raw} />
          </div>
          <div className="max-h-[32rem] overflow-auto">{code}</div>
        </div>
      </details>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-2xl border border-[var(--code-border)] bg-[var(--code-bg)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--code-border)] px-4 py-2">
          <span className="flex items-center gap-2 text-xs font-medium text-muted">
            <Code2 className="size-3.5" aria-hidden="true" /> Python
          </span>
          <span className="flex items-center gap-1.5">
            {edited && (
              <Chip size="sm" variant="soft" color="accent" className="hidden sm:inline-flex">
                {t.edits.edited}
              </Chip>
            )}
            {editable &&
              (edited ? (
                <button
                  type="button"
                  aria-label={t.edits.reset}
                  title={t.edits.reset}
                  onClick={() => {
                    edits.reset(cell);
                    setEditing(false);
                  }}
                  className="grid size-7 place-items-center rounded-lg text-muted transition-colors hover:bg-default hover:text-foreground"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={t.edits.editLabel(runnable.number)}
                  aria-pressed={editing}
                  title={t.edits.edit}
                  onClick={() => setEditing(!editing)}
                  className={`grid size-7 place-items-center rounded-lg transition-colors hover:bg-default hover:text-foreground ${editing ? 'bg-accent-soft text-accent' : 'text-muted'}`}
                >
                  <Pencil className="size-3.5" />
                </button>
              ))}
            {!presenting && <RunButtons cell={cell} />}
            <CopyButton text={edits && editable ? edits.code(cell) : cell.raw} />
          </span>
        </div>
        {!presenting && <ExerciseStrip cell={cell} />}
        {editorOpen ? (
          <>
            <Suspense fallback={code}>
              <CodeEditor
                key={edits.version}
                initialValue={edits.code(cell)}
                onChange={(next) => edits.change(cell, next)}
                label={t.edits.editorLabel(runnable.number)}
                autoFocus={editing && !edited}
              />
            </Suspense>
            {edited && (
              <details className="group border-t border-[var(--code-border)]">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-xs text-muted select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
                  {t.edits.original}
                </summary>
                <div className="border-t border-[var(--code-border)] opacity-80">{code}</div>
              </details>
            )}
          </>
        ) : cell.collapsed && !presenting ? (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm text-muted select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              <span className="group-open:hidden">{t.notebook.showFullCode(cell.lines)}</span>
              <span className="hidden group-open:inline">{t.notebook.hideCode}</span>
            </summary>
            <div className="border-t border-[var(--code-border)]">{code}</div>
          </details>
        ) : (
          code
        )}
      </div>
      {!presenting && <Outputs cell={cell} fileUrl={fileUrl} />}
    </div>
  );
}

/** The exercise a cell checks (#51): its title, solved or not, and for staff how many solved it. */
function ExerciseStrip({ cell }: { cell: Cell }) {
  const t = useT();
  const exercises = useExercises();
  const exercise = exercises?.of(cell);
  if (!exercises || !exercise) return null;
  const progress = exercises.progress(cell);
  return (
    <div
      data-testid="exercise"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--code-border)] bg-accent-soft/40 px-4 py-2 text-xs"
    >
      <span className="flex min-w-0 items-center gap-1.5 font-semibold text-accent">
        <ClipboardCheck className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="sr-only">{t.exercises.label}:</span>
        <span className="truncate">{exercise.title}</span>
      </span>
      {exercises.solved(cell) && (
        <span className="flex items-center gap-1 font-medium text-success">
          <CircleCheck className="size-3.5" aria-hidden="true" /> {t.exercises.solved}
        </span>
      )}
      {progress && (
        <span className="flex items-center gap-1 text-muted">
          <Users className="size-3.5" aria-hidden="true" /> {t.exercises.progress(progress.solved, progress.of)}
        </span>
      )}
    </div>
  );
}

/** A run's output once the cell has run on this page (#47), else the notebook's saved outputs. */
function Outputs({ cell, fileUrl }: { cell: Cell; fileUrl: (name: string) => string }) {
  const run = useRunOutput(cell);
  if (run) return run;
  return cell.outputs.map((out, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: a cell's outputs are fixed; i is their order
    <Output key={i} out={out} fileUrl={fileUrl} />
  ));
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const t = useT();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 1600);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-1.5 rounded-lg bg-[var(--code-bg)] px-2 py-1 text-xs text-muted transition-colors hover:bg-default hover:text-foreground"
    >
      {state === 'copied' ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
      <span aria-live="polite">
        {state === 'copied' ? t.notebook.copied : state === 'failed' ? t.notebook.copyFailed : t.notebook.copy}
      </span>
    </button>
  );
}

import { Button, Spinner } from '@heroui/react';
import {
  AlertTriangle,
  CircleCheck,
  CircleX,
  Hourglass,
  ListOrdered,
  Play,
  RotateCcw,
  Square,
  Terminal,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { CodeCell } from '../../../notebook/types';
import { useT } from '../../i18n';
import { useExercises } from '../../lib/exercises';
import { usePython, useSessionState } from '../../python/PythonProvider';
import type { CheckResult } from '../../python/runner';
import type { CellRun } from '../../python/session';
import { PlotlyFigure } from './PlotlyFigure';
import { YourCodeViz } from './YourCodeViz';

// Running code on the lab page (#47): the buttons in a code cell's header, the output of a run, and
// a bar with Python's state once it has started. Presentations (#50) run with larger buttons; the
// `run-text` classes grow the output for a projector (styles.css).

/** ▶ and "run the cells above", for a cell that can run here; nothing otherwise. */
export function RunButtons({ cell }: { cell: CodeCell }) {
  const t = useT();
  const python = usePython();
  const state = useSessionState(python?.session);
  const runnable = python?.cells.get(cell);
  if (!python || !runnable) return null;
  const run = state.runs.get(runnable.key);
  const busy = run?.state === 'running' || run?.state === 'queued';
  return (
    <span className="flex items-center gap-1">
      <span className="font-mono text-[0.7rem] text-muted" aria-hidden="true">
        [{runnable.number}]
      </span>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        className="size-7 min-w-7"
        aria-label={t.python.runAbove}
        onPress={() => void python.runAbove(cell)}
        isDisabled={runnable.number === 1}
      >
        <ListOrdered className="size-3.5" />
      </Button>
      {busy ? (
        <Button size="sm" variant="secondary" className="h-7 gap-1 px-2 text-xs" onPress={() => python.session.stop()}>
          <Square className="size-3" /> {t.python.stop}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="primary"
          className="h-7 gap-1 px-2 text-xs"
          aria-label={t.python.runLabel(runnable.number)}
          onPress={() => void python.run(cell)}
        >
          <Play className="size-3" /> {t.python.run}
        </Button>
      )}
    </span>
  );
}

/** ▶ (R) and "run the cells above" on a presentation's code step, for a cell that can run. */
export function PresentRunButtons({ cell }: { cell: CodeCell }) {
  const t = useT();
  const python = usePython();
  const state = useSessionState(python?.session);
  const runnable = python?.cells.get(cell);
  if (!python || !runnable) return null;
  const run = state.runs.get(runnable.key);
  const busy = run?.state === 'running' || run?.state === 'queued';
  return (
    <div className="flex flex-wrap gap-2">
      {busy ? (
        <Button variant="secondary" onPress={() => python.session.stop()}>
          <Square className="size-4" /> {t.present.stop}
        </Button>
      ) : (
        <Button variant="primary" onPress={() => void python.run(cell)}>
          <Play className="size-4" /> {t.present.run}
        </Button>
      )}
      {runnable.number > 1 && (
        <Button variant="ghost" onPress={() => void python.runAbove(cell)}>
          <ListOrdered className="size-4" /> {t.python.runAbove}
        </Button>
      )}
    </div>
  );
}

/** The cell's latest run, to show in place of its stored outputs; null when it has not run here. */
export function useRunOutput(cell: CodeCell) {
  const python = usePython();
  const state = useSessionState(python?.session);
  const runnable = python?.cells.get(cell);
  const run = runnable ? state.runs.get(runnable.key) : undefined;
  const exercise = useExercises()?.of(cell);
  if (!python || !runnable || !run) return null;
  return (
    <LiveOutput
      number={runnable.number}
      exercise={exercise?.title}
      onRunAbove={runnable.number > 1 ? () => void python.runAbove(cell) : undefined}
      run={run}
      starting={state.status === 'starting'}
      packages={state.running === runnable.key ? state.packages : null}
      timed={TIMING.test(cell.raw)}
      onAnswer={(text) => python.session.answer(text)}
      onClear={() => python.session.clear(runnable.key)}
    />
  );
}

/** Timing experiments (labs 1–3): their times come out longer in the browser. */
const TIMING = /\btime\.(perf_counter|time|process_time)\s*\(|\btimeit\b/;

function LiveOutput({
  number,
  exercise,
  onRunAbove,
  run,
  starting,
  packages,
  timed,
  onAnswer,
  onClear,
}: {
  number: number;
  /** The exercise this cell checks, by its title (#51). */
  exercise?: string;
  onRunAbove?: () => void;
  run: CellRun;
  starting: boolean;
  packages: string[] | null;
  /** The code measures time, which runs slower here. */
  timed: boolean;
  onAnswer: (text: string) => void;
  onClear: () => void;
}) {
  const t = useT();
  const outcome = run.outcome;
  const waiting = run.state !== 'done';
  return (
    <div
      className="overflow-hidden rounded-2xl border border-accent/40 bg-surface"
      data-testid="run-output"
      data-cell={number}
    >
      <div className="flex items-center justify-between gap-2 border-b border-separator px-4 py-1.5">
        <span className="flex items-center gap-2 text-[0.7rem] font-semibold tracking-wider text-accent uppercase">
          <Terminal className="size-3.5" aria-hidden="true" /> {t.python.yourOutput}
        </span>
        {!waiting && (
          <button type="button" onClick={onClear} className="text-xs text-muted hover:text-foreground">
            {t.python.clear}
          </button>
        )}
      </div>
      <div className="px-4 py-3" aria-live="polite">
        {timed && <p className="mb-2 text-xs text-muted">{t.python.slower}</p>}
        {run.output.map((block, i) =>
          'figure' in block ? (
            block.figure === 'image' ? (
              <img
                // biome-ignore lint/suspicious/noArrayIndexKey: output blocks only grow; i is their order
                key={i}
                src={block.url}
                alt={t.python.figure}
                className="my-2 block h-auto max-w-full rounded-xl bg-white p-1"
              />
            ) : block.figure === 'vizlab' ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: output blocks only grow; i is their order
              <YourCodeViz key={i} src={block.url} />
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: output blocks only grow; i is their order
              <div key={i} className="my-2 -mx-4 border-y border-separator">
                <PlotlyFigure src={block.url} />
              </div>
            )
          ) : (
            <pre
              // biome-ignore lint/suspicious/noArrayIndexKey: output blocks only grow; i is their order
              key={i}
              className={`run-text overflow-x-auto font-mono text-[0.8rem] leading-relaxed whitespace-pre-wrap ${
                block.stream === 'stderr' ? 'text-danger' : 'nb-stream text-foreground/90'
              }`}
            >
              {block.text}
            </pre>
          ),
        )}
        {outcome?.kind === 'ok' && outcome.value !== null && (
          <pre className="run-text nb-stream overflow-x-auto font-mono text-[0.8rem] whitespace-pre-wrap text-foreground/90">
            {outcome.value}
          </pre>
        )}
        {outcome?.kind === 'ok' && outcome.check && (
          <CheckCard title={exercise ?? t.exercises.check} check={outcome.check} onRunAbove={onRunAbove} />
        )}
        {run.asking && <AnswerInput onAnswer={onAnswer} />}
        {waiting && !run.asking && (
          <p className="run-note mt-1 flex items-center gap-2 text-sm text-muted">
            <Spinner size="sm" />
            {run.state === 'queued'
              ? starting
                ? t.python.starting
                : t.python.queued
              : packages
                ? t.python.loadingPackages(packages.join(', '))
                : t.python.running}
          </p>
        )}
        {outcome?.kind === 'error' && <ErrorOutput traceback={outcome.traceback} />}
        {outcome?.kind === 'interrupted' && <p className="run-note mt-1 text-sm text-warning">{t.python.stopped}</p>}
        {run.truncated && <p className="mt-1 text-xs text-muted">{t.python.truncated}</p>}
        {!waiting && run.output.length === 0 && outcome?.kind === 'ok' && outcome.value === null && !outcome.check && (
          <p className="text-sm text-muted">✓</p>
        )}
      </div>
    </div>
  );
}

const CHECK_LOOK = {
  pass: { Icon: CircleCheck, tone: 'border-success/40 bg-success/10 text-success' },
  fail: { Icon: CircleX, tone: 'border-danger/40 bg-danger/8 text-danger' },
  todo: { Icon: Hourglass, tone: 'border-warning/40 bg-warning/10 text-warning' },
  error: { Icon: CircleX, tone: 'border-danger/40 bg-danger/8 text-danger' },
} as const;

/** An exercise's check (#51): ✓, ✗ with the case that failed, not written yet, or the error. */
function CheckCard({ title, check, onRunAbove }: { title: string; check: CheckResult; onRunAbove?: () => void }) {
  const t = useT();
  const { Icon, tone } = CHECK_LOOK[check.status];
  const text =
    check.status === 'pass'
      ? t.exercises.pass
      : check.status === 'todo'
        ? t.exercises.todo
        : check.status === 'error'
          ? t.exercises.error
          : check.message
            ? t.exercises.failWith
            : t.exercises.fail;
  // A name not defined usually means the cells above have not run yet.
  const missing = check.status === 'error' && check.message.startsWith('NameError') && onRunAbove;
  return (
    <div
      role="status"
      data-testid="check-result"
      data-status={check.status}
      className={`mt-2 flex gap-3 rounded-xl border p-3 ${tone}`}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="run-text text-sm font-semibold">{title}</p>
        <p className="run-note text-sm text-foreground/90">{text}</p>
        {check.message && check.status !== 'pass' && check.status !== 'todo' && (
          <pre className="run-text mt-1 font-mono text-[0.8rem] whitespace-pre-wrap text-foreground">
            {check.message}
          </pre>
        )}
        {missing && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="run-note text-xs text-muted">{t.exercises.runAboveHint}</p>
            <Button size="sm" variant="secondary" onPress={onRunAbove}>
              <ListOrdered className="size-3.5" /> {t.python.runAbove}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** A failed run: where it failed, then the error itself in bold, the line to read out first. */
function ErrorOutput({ traceback }: { traceback: string }) {
  const t = useT();
  const lines = traceback.trimEnd().split('\n');
  const error = lines.pop() ?? '';
  return (
    <div role="alert" className="mt-1">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-danger">
        <AlertTriangle className="size-3.5" aria-hidden="true" /> {t.python.error}
      </p>
      <div className="mt-1 overflow-x-auto rounded-xl bg-danger/8 p-3 font-mono text-danger">
        {lines.length > 0 && (
          <pre className="run-text mb-1 text-[0.78rem] whitespace-pre-wrap opacity-80">{lines.join('\n')}</pre>
        )}
        <p className="run-text text-[0.84rem] font-semibold whitespace-pre-wrap">{error}</p>
      </div>
    </div>
  );
}

function AnswerInput({ onAnswer }: { onAnswer: (text: string) => void }) {
  const t = useT();
  const [text, setText] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onAnswer(text);
  };
  return (
    <form onSubmit={submit} className="mt-1 flex gap-2">
      <input
        // biome-ignore lint/a11y/noAutofocus: the program is waiting for this answer
        autoFocus
        aria-label={t.python.inputLabel}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 font-mono text-sm"
      />
      <Button type="submit" size="sm" variant="primary">
        {t.python.send}
      </Button>
    </form>
  );
}

/** Python's state above the notebook, once it has started: ready, starting or failed, and Restart. */
export function PythonBar() {
  const t = useT();
  const python = usePython();
  const state = useSessionState(python?.session);
  if (!python || (state.status === 'off' && state.runs.size === 0)) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm">
      <span className="flex items-center gap-2" aria-live="polite">
        {state.status === 'starting' ? (
          <>
            <Spinner size="sm" /> {t.python.starting}
          </>
        ) : state.status === 'failed' ? (
          <span className="text-danger">{t.python.failed(state.failure ?? '')}</span>
        ) : (
          <>
            <span
              className={`size-2 rounded-full ${state.status === 'ready' ? 'bg-success' : 'bg-default'}`}
              aria-hidden="true"
            />
            {state.status === 'ready' ? t.python.ready : 'Python'}
          </>
        )}
      </span>
      <span className="flex flex-wrap gap-2">
        {state.runs.size > 0 && (
          <Button size="sm" variant="ghost" onPress={() => python.session.clearAll()}>
            {t.python.clearAll}
          </Button>
        )}
        <Button size="sm" variant="tertiary" onPress={() => python.session.restart()} aria-describedby="restart-help">
          <RotateCcw className="size-4" /> {t.python.restart}
        </Button>
        <span id="restart-help" className="sr-only">
          {t.python.restartHelp}
        </span>
      </span>
    </div>
  );
}

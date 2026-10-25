import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Route as RouteIcon } from 'lucide-react';
import { m } from 'motion/react';
import type { LabProgress } from '../../shared/progress';
import { useT } from '../i18n';
import { SPRING } from '../lib/motion';
import { progressQuery } from '../lib/progress';

// A student's way through the course (#126): the labs open to them as a path, each coloured by how
// far they got, with a ring for the exercises solved, and the next step one tap away. Only their
// own progress, from the same data as "My progress".

export type PathState = 'new' | 'progress' | 'handed' | 'graded';

export function stateOf(lab: LabProgress): PathState {
  if (lab.notebooks.some((nb) => nb.grade)) return 'graded';
  if (lab.notebooks.some((nb) => nb.submittedAt)) return 'handed';
  if (lab.opened || lab.notebooks.some((nb) => nb.solved > 0)) return 'progress';
  return 'new';
}

const COLOR: Record<PathState, string> = {
  new: 'var(--state-unvisited)',
  progress: 'var(--state-current)',
  handed: 'var(--state-visited)',
  graded: 'var(--state-done)',
};

export function LearningPath({ org, courseId }: { org: string; courseId: string }) {
  const t = useT();
  const { data } = useQuery(progressQuery(org, courseId));
  const labs = data?.labs ?? [];
  if (!labs.length) return null;

  const states = labs.map(stateOf);
  const solved = labs.reduce((n, l) => n + l.notebooks.reduce((s, nb) => s + nb.solved, 0), 0);
  const exercises = labs.reduce((n, l) => n + l.notebooks.reduce((s, nb) => s + nb.exercises, 0), 0);
  const started = states.filter((s) => s !== 'new').length;
  // The next step: the first lab not yet handed in or graded.
  const nextIndex = states.findIndex((s) => s === 'new' || s === 'progress');
  const next = nextIndex >= 0 ? labs[nextIndex] : undefined;
  // The path is drawn up to the last lab the student has started.
  const reached = states.reduce((last, s, i) => (s !== 'new' ? i : last), 0);

  return (
    <section
      aria-labelledby="learning-path-title"
      className="mt-8 rounded-3xl border border-border bg-surface p-5 shadow-surface sm:p-6"
      data-testid="learning-path"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="learning-path-title" className="flex items-center gap-2 text-xl font-bold">
          <RouteIcon className="size-5 text-accent" aria-hidden="true" /> {t.path.title}
        </h2>
        <p className="text-sm text-muted">{t.path.summary(started, labs.length, solved, exercises)}</p>
      </div>

      <div className="-mx-2 mt-5 overflow-x-auto px-2 pb-2">
        <ol className="relative flex min-w-max items-start gap-0">
          {labs.map((lab, i) => {
            const state = states[i] ?? 'new';
            const ex = lab.notebooks.reduce((s, nb) => s + nb.exercises, 0);
            const done = lab.notebooks.reduce((s, nb) => s + nb.solved, 0);
            const ring = ex ? Math.round((done / ex) * 100) : state === 'new' ? 0 : 100;
            return (
              <m.li
                key={lab.id}
                className="relative flex w-24 flex-col items-center"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING.gentle, delay: i * 0.04 }}
              >
                {i > 0 && (
                  <span
                    className="absolute top-6 right-1/2 z-0 h-1 w-full -translate-y-1/2 rounded-full"
                    style={{ background: i <= reached ? 'var(--state-path)' : 'var(--state-unvisited)' }}
                    aria-hidden="true"
                  />
                )}
                <Link
                  to="/o/$org/courses/$courseId/labs/$labId"
                  params={{ org, courseId, labId: lab.id }}
                  aria-label={t.path.node(lab.n, lab.title, t.path.states[state], done, ex)}
                  className="relative z-10 grid size-12 place-items-center rounded-full outline-offset-4"
                  style={{
                    // The solved share in the state's colour, on a faint track of the same colour.
                    background: `conic-gradient(${COLOR[state]} ${ring}%, ${
                      state === 'new'
                        ? 'var(--state-unvisited)'
                        : `color-mix(in oklab, ${COLOR[state]} 28%, var(--state-unvisited))`
                    } 0)`,
                  }}
                  data-state={state}
                >
                  <span
                    className="grid size-9 place-items-center rounded-full bg-surface font-mono text-sm font-bold"
                    style={{ color: state === 'new' ? 'var(--muted)' : COLOR[state] }}
                  >
                    {lab.n}
                  </span>
                  {i === nextIndex && (
                    <span
                      className="absolute -inset-1 animate-ping rounded-full border-2 border-[var(--state-current)] opacity-40"
                      aria-hidden="true"
                    />
                  )}
                </Link>
                <span className="mt-2 line-clamp-2 px-1 text-center text-[0.7rem] leading-tight text-muted">
                  {lab.title}
                </span>
              </m.li>
            );
          })}
        </ol>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {(['new', 'progress', 'handed', 'graded'] as const).map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: COLOR[s] }} aria-hidden="true" />
              {t.path.states[s]}
            </li>
          ))}
        </ul>
        {next && (
          <Link
            to="/o/$org/courses/$courseId/labs/$labId"
            params={{ org, courseId, labId: next.id }}
            className="button button--primary gap-2"
            data-testid="learning-path-next"
          >
            {t.path.next(next.n)} <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
    </section>
  );
}

import { Input, Kbd, Modal, Spinner } from '@heroui/react';
import { useQueries } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CornerDownLeft, FileText, FlaskConical, KeyRound, Search, Waypoints } from 'lucide-react';
import { useDeferredValue, useId, useMemo, useState } from 'react';
import { VISUALIZER_IDS, type VisualizerId } from '../../shared/visualizers';
import { useT } from '../i18n';
import { useMe } from '../lib/auth';
import { coursesQuery } from '../lib/courses';
import { searchIndexQuery } from '../lib/search';
import { type Marked, mark, score, snippet, terms as termsOf } from '../lib/search-text';

// The ⌘K palette (#17), as on the course site: labs, their notebooks' sections and the
// visualizations, searched as you type. Course content comes from the server already limited to
// what the user may see.

type Target =
  | { kind: 'lab'; org: string; courseId: string; labId: string; notebook?: string; anchor?: string }
  | { kind: 'viz'; vizId: VisualizerId };

type Hit = {
  key: string;
  icon: typeof FileText;
  title: Marked;
  context: string;
  excerpt?: Marked;
  target: Target;
  score: number;
};

const MAX_HITS = 30;

function combine<T>(results: { data: T | undefined; isPending: boolean; isError: boolean }[]) {
  return {
    data: results.map((r) => r.data),
    pending: results.some((r) => r.isPending),
    failed: results.some((r) => r.isError),
  };
}

export default function SearchPalette({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const me = useMe();
  const navigate = useNavigate();
  const t = useT();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const deferred = useDeferredValue(query);

  // Combined results keep their identity while the data is the same, so the search below reruns
  // only when the query or an index changes.
  const orgs = useMemo(() => (me?.organizations ?? []).map((org) => org.slug), [me]);
  const courseLists = useQueries({ queries: orgs.map((org) => coursesQuery(org)), combine });
  const courses = useMemo(
    () =>
      orgs.flatMap((org, i) =>
        (courseLists.data[i] ?? []).filter((c) => !c.archivedAt).map((course) => ({ org, course })),
      ),
    [orgs, courseLists.data],
  );
  const indexes = useQueries({
    queries: courses.map(({ org, course }) => searchIndexQuery(org, course.id)),
    combine,
  });
  const loading = courseLists.pending || indexes.pending;
  const failed = courseLists.failed || indexes.failed;

  const hits = useMemo(() => {
    const terms = termsOf(deferred);
    if (terms.length === 0) return [];
    const found: Hit[] = [];
    courses.forEach(({ org, course }, i) => {
      const index = indexes.data[i];
      if (!index) return;
      const inCourse = courses.length > 1 ? ` · ${course.title}` : '';
      const labs = new Map(index.labs.map((lab) => [lab.id, lab]));
      for (const lab of index.labs) {
        const title = `${t.labs.lab(lab.n)} · ${lab.title}`;
        const s = score(terms, [title, lab.summary ?? '']);
        if (s === 0) continue;
        found.push({
          key: `lab-${lab.id}`,
          icon: FlaskConical,
          title: mark(title, terms),
          context: `${t.search.lab}${inCourse}`,
          excerpt: lab.summary ? snippet(lab.summary, terms) : undefined,
          target: { kind: 'lab', org, courseId: course.id, labId: lab.id },
          // A lab whose name matches comes before its sections.
          score: s * 3,
        });
      }
      const notebooks = new Map(index.notebooks.map((nb) => [nb.id, nb]));
      index.sections.forEach((section, j) => {
        const nb = notebooks.get(section.notebookId);
        const lab = nb && labs.get(nb.labId);
        if (!nb || !lab) return;
        const s = score(terms, [section.title, section.keywords, section.text]);
        if (s === 0) return;
        const notebookTitle = nb.kind === 'solution' ? t.lab.solutionTab(nb.title) : nb.title;
        found.push({
          key: `section-${nb.id}-${j}`,
          icon: nb.kind === 'solution' ? KeyRound : FileText,
          title: mark(section.title || nb.title, terms),
          context: `${t.labs.lab(lab.n)} · ${notebookTitle}${inCourse}`,
          excerpt: section.text ? snippet(section.text, terms) : undefined,
          target: {
            kind: 'lab',
            org,
            courseId: course.id,
            labId: lab.id,
            notebook: nb.id,
            anchor: section.anchor ?? undefined,
          },
          score: s,
        });
      });
    });
    for (const id of VISUALIZER_IDS) {
      const title = t.viz.names[id];
      const s = score(terms, [title, t.viz.summaries[id], id]);
      if (s === 0) continue;
      found.push({
        key: `viz-${id}`,
        icon: Waypoints,
        title: mark(title, terms),
        context: t.search.visualization,
        excerpt: snippet(t.viz.summaries[id], terms),
        target: { kind: 'viz', vizId: id },
        score: s * 2,
      });
    }
    return found.sort((a, b) => b.score - a.score).slice(0, MAX_HITS);
  }, [deferred, courses, indexes.data, t]);

  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    onOpenChange(false);
    const t = hit.target;
    if (t.kind === 'viz') void navigate({ to: '/visualizations/$vizId', params: { vizId: t.vizId } });
    else
      void navigate({
        to: '/o/$org/courses/$courseId/labs/$labId',
        params: { org: t.org, courseId: t.courseId, labId: t.labId },
        search: { notebook: t.notebook },
        hash: t.anchor,
      });
  };

  const current = Math.min(active, Math.max(0, hits.length - 1));
  const typed = query.trim() !== '';

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange} variant="blur">
      <Modal.Container placement="top" size="lg" className="mt-[10vh]">
        <Modal.Dialog aria-label={t.search.dialog} className="overflow-hidden p-0">
          <div className="flex items-center gap-3 border-b border-separator px-4 py-3">
            <Search className="size-5 shrink-0 text-muted" aria-hidden="true" />
            <Input
              autoFocus
              role="combobox"
              aria-label={t.search.input}
              aria-expanded={hits.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={hits[current] ? `${listId}-${current}` : undefined}
              placeholder={t.search.placeholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive(Math.min(current + 1, hits.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive(Math.max(current - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  go(hits[current]);
                }
              }}
              className="min-w-0 flex-1 border-0 bg-transparent text-base shadow-none focus:ring-0"
            />
            {loading && <Spinner size="sm" aria-label={t.search.loading} />}
            <Kbd className="hidden sm:inline-flex">Esc</Kbd>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {failed && <p className="px-3 py-2 text-center text-sm text-danger">{t.search.someFailed}</p>}
            {!typed && <p className="px-3 py-6 text-center text-sm text-muted">{t.search.hint}</p>}
            {typed && !loading && hits.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted">{t.search.none(query.trim())}</p>
            )}
            {/* Options take clicks; the keyboard stays in the input (aria-activedescendant). */}
            <div id={listId} role="listbox" aria-label={t.search.results} className={hits.length ? '' : 'hidden'}>
              {hits.map((hit, i) => {
                const on = i === current;
                return (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: the input handles the keys for the whole list
                  <div
                    key={hit.key}
                    id={`${listId}-${i}`}
                    role="option"
                    tabIndex={-1}
                    aria-selected={on}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(hit)}
                    className={`flex cursor-pointer gap-3 rounded-2xl px-3 py-2.5 transition-colors ${on ? 'bg-accent-soft' : 'hover:bg-default'}`}
                  >
                    <hit.icon
                      className={`mt-0.5 size-4 shrink-0 ${on ? 'text-accent' : 'text-muted'}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        <Highlighted parts={hit.title} />
                      </span>
                      <span className="block truncate text-xs text-muted">{hit.context}</span>
                      {hit.excerpt && (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-foreground/70">
                          <Highlighted parts={hit.excerpt} />
                        </span>
                      )}
                    </span>
                    {on && <CornerDownLeft className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />}
                  </div>
                );
              })}
            </div>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function Highlighted({ parts }: { parts: Marked }) {
  return parts.map((part, i) =>
    part.mark ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one text never change order
      <mark key={i} className="rounded bg-accent-soft px-0.5 text-accent">
        {part.text}
      </mark>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one text never change order
      <span key={i}>{part.text}</span>
    ),
  );
}

import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import type { VisualizerId } from '../../../shared/visualizers';
import { VizPreview } from '../../components/VizPreview';
import { t as messages, useT } from '../../i18n';
import { APP_NAME } from '../../lib/brand';

export const Route = createFileRoute('/visualizations/')({
  head: () => ({ meta: [{ title: `${messages().viz.pageTitle} · ${APP_NAME}` }] }),
  component: VisualizationsPage,
});

// Grouped by topic (#125), in the order a course meets them; a topic means the same in every
// institution, a lab number does not.
const GROUPS: { key: 'sorting' | 'graphs' | 'paths' | 'flows'; ids: VisualizerId[] }[] = [
  { key: 'sorting', ids: ['renditja', 'gara-e-krahasimeve', 'kompleksiteti', 'pema-rekursive', 'gjej-algoritmin'] },
  { key: 'graphs', ids: ['grafet', 'labirinti', 'kruskal-prim', 'scc-topologjike', 'tabela-gjurmimit'] },
  { key: 'paths', ids: ['rruget', 'kuizi-bellman-ford', 'floyd-warshall', 'gara-e-rrugeve'] },
  { key: 'flows', ids: ['rrjedha-max', 'ciftezimi'] },
];

function VisualizationsPage() {
  const t = useT();
  return (
    <section className="container-page py-12">
      <h1 className="text-3xl font-bold sm:text-4xl">{t.viz.title}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t.viz.lead}</p>
      {GROUPS.map(({ key, ids }) => (
        <section key={key} className="mt-10" aria-labelledby={`viz-group-${key}`}>
          <h2 id={`viz-group-${key}`} className="text-xl font-bold">
            {t.viz.groups[key].title}
          </h2>
          <p className="mt-1 text-sm text-muted">{t.viz.groups[key].text}</p>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ids.map((id) => (
              <li key={id}>
                <Link
                  to="/visualizations/$vizId"
                  params={{ vizId: id }}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-surface transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-accent/50"
                  data-testid="viz-card"
                >
                  <span className="block h-32 border-b border-border bg-surface-secondary px-4 py-3">
                    <VizPreview id={id} />
                  </span>
                  <span className="flex flex-1 flex-col p-5">
                    <span className="font-semibold tracking-tight">{t.viz.names[id]}</span>
                    <span className="mt-1.5 flex-1 text-sm text-muted">{t.viz.summaries[id]}</span>
                    <span className="mt-4 flex items-center gap-1.5 text-sm font-medium text-accent" aria-hidden="true">
                      {t.viz.open} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}

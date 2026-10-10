import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { VISUALIZER_IDS, VISUALIZERS } from '../../../shared/visualizers';
import { VIZ } from '../../../viz';
import { APP_NAME } from '../../lib/brand';

export const Route = createFileRoute('/visualizations/')({
  head: () => ({ meta: [{ title: `Vizualizimet · ${APP_NAME}` }] }),
  component: VisualizationsPage,
});

function VisualizationsPage() {
  return (
    <section className="container-page py-12">
      <h1 className="text-3xl font-bold tracking-tight">Vizualizimet</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Algoritmet e lëndës në lëvizje: ecni hap pas hapi, ndryshoni të dhënat dhe krahasoni strategjitë.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {VISUALIZER_IDS.map((id) => (
          <li key={id}>
            <Link
              to="/visualizations/$vizId"
              params={{ vizId: id }}
              className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent/50"
            >
              <span className="font-semibold tracking-tight">{VISUALIZERS[id]}</span>
              <span className="mt-1.5 flex-1 text-sm text-muted">{VIZ[id].summary}</span>
              <span className="mt-4 flex items-center gap-1.5 text-sm font-medium text-accent" aria-hidden="true">
                Hape <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

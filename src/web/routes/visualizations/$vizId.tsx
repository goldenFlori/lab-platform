import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { isVisualizerId } from '../../../shared/visualizers';
import { VizEmbed } from '../../components/VizEmbed';
import { t as messages, useT } from '../../i18n';
import { APP_NAME } from '../../lib/brand';

export const Route = createFileRoute('/visualizations/$vizId')({
  loader: ({ params }) => {
    if (!isVisualizerId(params.vizId)) throw notFound();
    return { vizId: params.vizId };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData ? messages().viz.names[loaderData.vizId] : messages().viz.fallbackTitle} · ${APP_NAME}` },
    ],
  }),
  component: VisualizationPage,
});

function VisualizationPage() {
  const { vizId } = Route.useLoaderData();
  const t = useT();
  return (
    <section className="container-page py-8">
      <Link
        to="/visualizations"
        className="inline-flex items-center gap-1.5 rounded-full text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t.viz.all}
      </Link>
      <h1 className="sr-only">{t.viz.names[vizId]}</h1>
      <div className="mt-4">
        <VizEmbed key={vizId} viz={vizId} />
      </div>
    </section>
  );
}

import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, Waypoints } from 'lucide-react';
import { useT } from '../i18n';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const t = useT();
  return (
    <section className="relative overflow-hidden">
      <div
        className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
        aria-hidden="true"
      />
      <div className="container-page relative py-20 sm:py-28">
        <p className="text-sm font-semibold text-accent">{t.home.eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight text-balance sm:text-6xl">
          {t.home.titleStart} <span className="text-gradient">{t.home.titleEnd}</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">{t.home.lead}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/courses" className="button button--primary gap-2">
            {t.home.myCourses} <ArrowRight className="size-4" />
          </Link>
          <Link to="/visualizations" className="button button--secondary gap-2">
            <Waypoints className="size-4" /> {t.home.visualizations}
          </Link>
        </div>
      </div>
    </section>
  );
}

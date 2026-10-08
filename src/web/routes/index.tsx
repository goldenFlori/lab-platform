import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
        aria-hidden="true"
      />
      <div className="container-page relative py-20 sm:py-28">
        <p className="text-sm font-semibold text-accent">Laboratori i programimit dhe algoritmeve</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight text-balance sm:text-6xl">
          Shihni algoritmin <span className="text-gradient">në lëvizje</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          Fletore laboratori me rezultate reale, vizualizime interaktive dhe pedagogu që vendos çfarë hapet për klasën.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/courses" className="button button--primary gap-2">
            Kurset e mia <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export function NotFoundPage() {
  return (
    <section className="container-page grid min-h-[60vh] place-items-center py-20 text-center">
      <div>
        <p className="text-gradient font-mono text-7xl font-extrabold">404</p>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Kjo rrugë nuk ekziston në graf</h1>
        <p className="mt-2 text-muted">
          Asnjë shteg nga këtu te faqja që kërkuat, por kreu është gjithmonë i arritshëm.
        </p>
        <Link to="/" className="button button--primary mt-8 gap-2">
          <ArrowLeft className="size-4" /> Kthehu në kreu
        </Link>
      </div>
    </section>
  );
}

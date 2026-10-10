import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useT } from '../i18n';

export function NotFoundPage() {
  const t = useT();
  return (
    <section className="container-page grid min-h-[60vh] place-items-center py-20 text-center">
      <div>
        <p className="text-gradient font-mono text-7xl font-extrabold">404</p>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">{t.notFound.title}</h1>
        <p className="mt-2 text-muted">{t.notFound.text}</p>
        <Link to="/" className="button button--primary mt-8 gap-2">
          <ArrowLeft className="size-4" /> {t.common.backHome}
        </Link>
      </div>
    </section>
  );
}

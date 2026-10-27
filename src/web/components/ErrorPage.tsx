import { Button } from '@heroui/react';
import { type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';
import { useT } from '../i18n';
import { reportError } from '../lib/report-error';

/** Shown when a page fails to load or render. Details stay out of production builds. */
export function ErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const t = useT();
  // A page that failed in the app's own code reaches the owner (#179); API failures do not.
  useEffect(() => {
    if (import.meta.env.PROD) reportError('render', error);
  }, [error]);
  return (
    <section className="container-page grid min-h-[60vh] place-items-center py-20 text-center">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.error.title}</h1>
        <p className="mt-2 text-muted">{t.error.text}</p>
        {import.meta.env.DEV && (
          <pre className="mx-auto mt-6 max-w-full overflow-x-auto rounded-xl border border-border bg-surface-secondary p-4 text-left text-sm">
            {error instanceof Error ? error.message : String(error)}
          </pre>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button
            variant="primary"
            onPress={() => {
              reset();
              router.invalidate();
            }}
          >
            <RotateCcw className="size-4" /> {t.error.retry}
          </Button>
          <Link to="/" className="button button--secondary gap-2">
            <ArrowLeft className="size-4" /> {t.common.backHome}
          </Link>
        </div>
      </div>
    </section>
  );
}

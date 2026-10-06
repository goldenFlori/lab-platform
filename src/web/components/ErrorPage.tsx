import { Button } from '@heroui/react';
import { type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router';
import { ArrowLeft, RotateCcw } from 'lucide-react';

/** Shown when a page fails to load or render. Details stay out of production builds. */
export function ErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <section className="container-page grid min-h-[60vh] place-items-center py-20 text-center">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Diçka shkoi keq</h1>
        <p className="mt-2 text-muted">Ndodhi një gabim i papritur. Provoni përsëri ose kthehuni në kreu.</p>
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
            <RotateCcw className="size-4" /> Provo përsëri
          </Button>
          <Link to="/" className="button button--secondary gap-2">
            <ArrowLeft className="size-4" /> Kthehu në kreu
          </Link>
        </div>
      </div>
    </section>
  );
}

import { createFileRoute, Link } from '@tanstack/react-router';
import { CircleHelp } from 'lucide-react';
import { t as messages } from '../../i18n';
import { useHelp } from '../../i18n/help';
import { APP_NAME } from '../../lib/brand';

// The guides (#194), public: students and pedagogs read them before they have an account too.

export const Route = createFileRoute('/help/')({
  head: () => ({ meta: [{ title: `${messages().help.title} · ${APP_NAME}` }] }),
  component: HelpPage,
});

function HelpPage() {
  const h = useHelp();
  return (
    <article className="container-page max-w-3xl py-12">
      <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
        <CircleHelp className="size-7 text-accent" aria-hidden="true" /> {h.title}
      </h1>
      <p className="mt-4 text-lg text-muted">{h.lead}</p>
      {(['student', 'staff'] as const).map((audience) => (
        <section key={audience} className="mt-10" aria-labelledby={`help-${audience}`}>
          <h2 id={`help-${audience}`} className="text-xl font-semibold tracking-tight">
            {audience === 'student' ? h.students : h.staff}
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {h.guides
              .filter((g) => g.audience === audience)
              .map((g) => (
                <li key={g.id}>
                  <Link
                    to="/help/$guide"
                    params={{ guide: g.id }}
                    className="block h-full rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-accent"
                  >
                    <span className="block font-semibold">{g.title}</span>
                    <span className="mt-1 block text-sm text-muted">{g.summary}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </article>
  );
}

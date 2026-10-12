import { createFileRoute, Link } from '@tanstack/react-router';
import { ShieldCheck } from 'lucide-react';
import { t as messages, useT } from '../i18n';
import { APP_NAME } from '../lib/brand';

// The privacy policy (#100), public: what is kept, why, where, for how long and who sees it.

export const Route = createFileRoute('/privacy')({
  head: () => ({ meta: [{ title: `${messages().privacy.title} · ${APP_NAME}` }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const t = useT();
  return (
    <article className="container-page max-w-3xl py-12">
      <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
        <ShieldCheck className="size-7 text-accent" aria-hidden="true" /> {t.privacy.title}
      </h1>
      <p className="mt-1 text-sm text-muted">{t.privacy.updated}</p>
      <p className="mt-6 text-lg">{t.privacy.intro}</p>
      {t.privacy.sections.map((section) => (
        <section key={section.heading} className="mt-8">
          <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      <Link to="/account/data" className="button button--secondary mt-10">
        {t.privacy.myData}
      </Link>
    </article>
  );
}

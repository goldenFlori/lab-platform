import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { Fragment, useState } from 'react';
import { t as messages, useLocale } from '../../i18n';
import { type HelpStep, useHelp } from '../../i18n/help';
import { APP_NAME } from '../../lib/brand';

// One guide (#194): its steps, with pictures of the real pages where they help. **Bold** in a step is
// a button or a name as it shows on screen.

export const Route = createFileRoute('/help/$guide')({
  head: () => ({ meta: [{ title: `${messages().help.title} · ${APP_NAME}` }] }),
  component: GuidePage,
});

/** A step's text with its **bold** parts as <strong>. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
        // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed text
        i % 2 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}

function Shot({ step, n }: { step: HelpStep; n: number }) {
  const h = useHelp();
  const locale = useLocale();
  const [missing, setMissing] = useState(false);
  if (!step.shot || missing) return null;
  return (
    <img
      src={`/help/${locale}/${step.shot}.jpg`}
      alt={h.shotAlt(n)}
      width={1280}
      height={800}
      loading="lazy"
      onError={() => setMissing(true)}
      className="mt-3 h-auto w-full rounded-xl border border-border shadow-surface"
    />
  );
}

function GuidePage() {
  const { guide: id } = Route.useParams();
  const h = useHelp();
  const guide = h.guides.find((g) => g.id === id);
  return (
    <article className="container-page max-w-3xl py-12">
      <Link
        to="/help"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> {h.back}
      </Link>
      {!guide ? (
        <p className="mt-6">{h.missing}</p>
      ) : (
        <>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">{guide.title}</h1>
          <p className="mt-2 text-lg text-muted">{guide.summary}</p>
          <ol className="mt-8 grid gap-6" data-testid="guide-steps">
            {guide.steps.map((step, i) => (
              <li key={step.text} className="grid grid-cols-[2rem_1fr] gap-3">
                <span
                  className="grid size-8 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 pt-1">
                  <p>
                    <Rich text={step.text} />
                  </p>
                  <Shot step={step} n={i + 1} />
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </article>
  );
}

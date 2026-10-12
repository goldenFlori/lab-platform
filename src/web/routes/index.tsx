import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowRight,
  Building2,
  Code2,
  Lightbulb,
  LogIn,
  Mail,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Waypoints,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { VizEmbed } from '../components/VizEmbed';
import { useT } from '../i18n';
import { useMe } from '../lib/auth';
import { CONTACT_EMAIL, DEMO_VIDEO } from '../lib/brand';

// The public front page (#103): what the platform does, for a visitor, an institution or a grant
// reviewer, in a minute. A real visualization plays in place of a screenshot; the demo video shows
// once it exists (DEMO_VIDEO). No tracking, nothing heavy until it is scrolled to.

export const Route = createFileRoute('/')({
  component: HomePage,
});

const FEATURES = [
  { key: 'python', Icon: Smartphone },
  { key: 'yourCode', Icon: Code2 },
  { key: 'live', Icon: Radio },
  { key: 'ai', Icon: Lightbulb },
  { key: 'control', Icon: SlidersHorizontal },
  { key: 'privacy', Icon: ShieldCheck },
] as const;

function HomePage() {
  const t = useT();
  const me = useMe();
  return (
    <>
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
            {me ? (
              <Link to="/courses" className="button button--primary gap-2">
                {t.home.myCourses} <ArrowRight className="size-4" />
              </Link>
            ) : (
              <Link to="/login" className="button button--primary gap-2">
                <LogIn className="size-4" /> {t.home.signIn}
              </Link>
            )}
            <a href="#demo" className="button button--secondary gap-2">
              {t.home.seeIt}
            </a>
          </div>
        </div>
      </section>

      <section id="demo" className="container-page scroll-mt-20 py-12" aria-labelledby="demo-title">
        <h2 id="demo-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.home.demoTitle}
        </h2>
        <p className="mt-2 max-w-2xl text-muted">{DEMO_VIDEO ? t.home.demoVideoLead : t.home.demoLead}</p>
        <div className="mt-6">
          {DEMO_VIDEO ? (
            // biome-ignore lint/a11y/useMediaCaption: the demo has no speech; its text is on screen
            <video src={DEMO_VIDEO} controls preload="metadata" className="w-full rounded-3xl border border-border" />
          ) : (
            <VizEmbed viz="labirinti" label={t.home.demoLabel} />
          )}
        </div>
        <Link to="/visualizations" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent">
          <Waypoints className="size-4" /> {t.home.allVisualizations} <ArrowRight className="size-4" />
        </Link>
      </section>

      <section className="container-page py-12" aria-labelledby="features-title">
        <h2 id="features-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.home.featuresTitle}
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ key, Icon }) => (
            <li key={key}>
              <Card icon={<Icon className="size-5" />} title={t.home.features[key].title}>
                {t.home.features[key].text}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-page py-12" aria-labelledby="who-title">
        <div className="rounded-3xl border border-border bg-surface p-6 sm:p-10">
          <h2 id="who-title" className="flex items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
            <Building2 className="size-6 text-accent" aria-hidden="true" /> {t.home.whoTitle}
          </h2>
          <p className="mt-3 max-w-3xl text-muted">{t.home.whoText}</p>
          <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
            {t.home.whoPoints.map((point) => (
              <li key={point} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {CONTACT_EMAIL && (
              <a href={`mailto:${CONTACT_EMAIL}`} className="button button--primary gap-2">
                <Mail className="size-4" /> {t.home.contact}
              </a>
            )}
            <Link to="/privacy" className="button button--secondary gap-2">
              <ShieldCheck className="size-4" /> {t.home.privacy}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="h-full rounded-2xl border border-border bg-surface p-5">
      <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
        {icon}
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  );
}

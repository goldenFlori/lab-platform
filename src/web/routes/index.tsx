import { Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowRight,
  Building2,
  Code2,
  GraduationCap,
  Lightbulb,
  LogIn,
  Mail,
  Presentation,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Waypoints,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { LiveGraph } from '../components/home/LiveGraph';
import { VizEmbed } from '../components/VizEmbed';
import { useT } from '../i18n';
import { useMe } from '../lib/auth';
import { CONTACT_EMAIL, DEMO_VIDEO } from '../lib/brand';
import { demoStatusQuery, useTryDemo } from '../lib/demo';

// The public front page (#103): what the platform does, for a visitor, an institution or a grant
// reviewer, in a minute. A real visualization plays in place of a screenshot; the demo video shows
// once it exists (DEMO_VIDEO). No tracking, nothing heavy until it is scrolled to.

export const Route = createFileRoute('/')({
  component: HomePage,
});

// Each feature wears one of the algorithm-state colours (#128).
const FEATURES = [
  { key: 'python', Icon: Smartphone, color: 'var(--state-current)' },
  { key: 'yourCode', Icon: Code2, color: 'var(--state-path)' },
  { key: 'live', Icon: Radio, color: 'var(--state-frontier)' },
  { key: 'ai', Icon: Lightbulb, color: 'var(--state-visited)' },
  { key: 'control', Icon: SlidersHorizontal, color: 'var(--state-done)' },
  { key: 'privacy', Icon: ShieldCheck, color: 'var(--state-reject)' },
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
        <div className="hero-glow absolute inset-0" aria-hidden="true" />
        <div className="container-page relative grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs font-semibold text-accent">
              <span className="size-1.5 rounded-full bg-state-frontier" aria-hidden="true" /> {t.home.eyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-extrabold text-balance sm:text-6xl">
              {t.home.titleStart} <span className="text-gradient">{t.home.titleEnd}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">{t.home.lead}</p>
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
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
              {t.home.stats.map(([value, label]) => (
                <div key={label}>
                  <dt className="sr-only">{label}</dt>
                  <dd>
                    <span className="block font-[family-name:var(--font-display)] text-2xl font-bold">{value}</span>
                    <span className="text-xs text-muted">{label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <LiveGraph />
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
        {!me && <TryIt />}
      </section>

      <section className="container-page py-12" aria-labelledby="features-title">
        <h2 id="features-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.home.featuresTitle}
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ key, Icon, color }) => (
            <li key={key}>
              <Card icon={<Icon className="size-5" />} color={color} title={t.home.features[key].title}>
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

/** The demo institution (#216), when there is one: try it as a student or a pedagog, no account needed. */
function TryIt() {
  const t = useT();
  const status = useQuery(demoStatusQuery);
  const tryDemo = useTryDemo();
  if (!status.data?.enabled) return null;
  return (
    <div className="mt-8 rounded-3xl border border-border bg-surface p-5 shadow-surface sm:p-7" data-testid="try-demo">
      <h3 className="text-lg font-semibold tracking-tight">{t.demo.title}</h3>
      <p className="mt-1 max-w-2xl text-sm text-muted">{t.demo.lead}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant="primary"
          isPending={tryDemo.isPending && tryDemo.variables === 'student'}
          onPress={() => tryDemo.mutate('student')}
        >
          <GraduationCap className="size-4" /> {t.demo.asStudent}
        </Button>
        <Button
          variant="secondary"
          isPending={tryDemo.isPending && tryDemo.variables === 'pedagog'}
          onPress={() => tryDemo.mutate('pedagog')}
        >
          <Presentation className="size-4" /> {t.demo.asPedagog}
        </Button>
      </div>
      {tryDemo.isError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {t.demo.failed}
        </p>
      )}
    </div>
  );
}

function Card({
  icon,
  color,
  title,
  children,
}: {
  icon: ReactNode;
  color: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="group h-full rounded-2xl border border-border bg-surface p-5 shadow-surface transition-transform duration-300 hover:-translate-y-0.5">
      <span
        className="grid size-10 place-items-center rounded-xl"
        style={{ color, background: `color-mix(in oklab, ${color} 14%, transparent)` }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  );
}

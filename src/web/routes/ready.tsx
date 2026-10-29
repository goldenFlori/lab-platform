import { Button } from '@heroui/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Check, Circle, CircleAlert, Loader2, MonitorCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { t as messages, useT } from '../i18n';
import { APP_NAME } from '../lib/brand';
import { COURSE_LIBRARIES, deviceReady, ENGINE_MB, markDeviceReady } from '../lib/device-ready';
import { PythonSession } from '../python/session';

// The get-ready page (#191), public so a student can prepare a device at home before having an
// account. It checks the browser, downloads the Python engine and the course's libraries through the
// same Python as the lab page (so the service worker keeps them), runs a test, and says "ready" or
// what to do. Nothing starts on its own: about 31 MB is a lot on a phone's data plan.

export const Route = createFileRoute('/ready')({
  head: () => ({ meta: [{ title: `${messages().ready.pageTitle} · ${APP_NAME}` }] }),
  component: ReadyPage,
});

const TOTAL_MB = ENGINE_MB + COURSE_LIBRARIES.reduce((n, l) => n + l.mb, 0);

type StepState = 'waiting' | 'working' | 'done' | 'failed';
type Step = { key: string; label: string; mb: number; state: StepState };

/** A run in the session; rejects if Python itself fails to start (the run would wait forever). */
function runIn(session: PythonSession, key: string, code: string) {
  return new Promise<string>((resolve, reject) => {
    const off = session.subscribe(() => {
      const { status, failure } = session.getState();
      if (status === 'failed') {
        off();
        reject(new Error(failure ?? 'python'));
      }
    });
    session.run(key, code, '<gati>').then((run) => {
      off();
      if (run.outcome?.kind !== 'ok') return reject(new Error(run.outcome?.kind ?? 'run'));
      resolve(run.output.map((o) => ('text' in o ? o.text : '')).join(''));
    }, reject);
  });
}

function ReadyPage() {
  const t = useT();
  const before = useRef(deviceReady()).current;
  const [steps, setSteps] = useState<Step[]>(() => [
    { key: 'browser', label: t.ready.browser, mb: 0, state: 'waiting' },
    { key: 'python', label: t.ready.python, mb: ENGINE_MB, state: 'waiting' },
    ...COURSE_LIBRARIES.map((l) => ({
      key: l.name,
      label: t.ready.library(l.name),
      mb: l.mb,
      state: 'waiting' as const,
    })),
    { key: 'test', label: t.ready.test, mb: 0, state: 'waiting' },
  ]);
  const [message, setMessage] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const session = useRef<PythonSession | null>(null);
  useEffect(() => () => session.current?.dispose(), []);

  const mark = (key: string, state: StepState) =>
    setSteps((list) => list.map((s) => (s.key === key ? { ...s, state } : s)));

  async function start() {
    setBusy(true);
    setMessage(null);
    let step = 'browser';
    try {
      // 1. Can this browser run Python here, with room to keep it?
      mark(step, 'working');
      const able = typeof WebAssembly === 'object' && typeof Worker === 'function' && globalThis.crossOriginIsolated;
      if (!able) {
        mark(step, 'failed');
        return setMessage({ tone: 'danger', text: t.ready.oldBrowser });
      }
      // Asked, not required: a kept site is cleared last when the device runs low.
      await navigator.storage?.persist?.().catch(() => false);
      const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
      const free =
        estimate?.quota !== undefined ? (estimate.quota - (estimate.usage ?? 0)) / 1e6 : Number.POSITIVE_INFINITY;
      mark(step, 'done');
      if (free < TOTAL_MB * 2) setMessage({ tone: 'warning', text: t.ready.lowStorage(Math.floor(free)) });

      // 2. The engine, then each library, as the lab page loads them.
      session.current ??= new PythonSession({ input: false });
      step = 'python';
      mark(step, 'working');
      await runIn(session.current, step, 'pass');
      mark(step, 'done');
      for (const library of COURSE_LIBRARIES) {
        step = library.name;
        mark(step, 'working');
        await runIn(session.current, step, library.code);
        mark(step, 'done');
      }

      // 3. A test, so "ready" means code runs.
      step = 'test';
      mark(step, 'working');
      const out = await runIn(session.current, step, 'print(sum(range(10)))');
      if (out.trim() !== '45') {
        mark(step, 'failed');
        return setMessage({ tone: 'danger', text: t.ready.testFailed });
      }
      mark(step, 'done');
      markDeviceReady();
      setMessage({ tone: 'success', text: t.ready.ready });
    } catch {
      mark(step, 'failed');
      setMessage({ tone: 'danger', text: t.ready.failed });
      // A failed start leaves the session unusable: the next try starts a new one.
      session.current?.dispose();
      session.current = null;
    } finally {
      setBusy(false);
    }
  }

  const doneMb = steps.filter((s) => s.state === 'done').reduce((n, s) => n + s.mb, 0);
  const percent = Math.round((100 * doneMb) / TOTAL_MB);
  const started = steps.some((s) => s.state !== 'waiting');
  const finished = steps.every((s) => s.state === 'done');

  return (
    <article className="container-page max-w-2xl py-12">
      <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
        <MonitorCheck className="size-7 text-accent" aria-hidden="true" /> {t.ready.title}
      </h1>
      <p className="mt-4 text-lg">{t.ready.lead(TOTAL_MB)}</p>
      <p className="mt-2 text-muted">{t.ready.where}</p>
      {before && !started && <p className="mt-4 text-sm text-success">{t.ready.readyBefore}</p>}

      <ol className="mt-8 grid gap-2" aria-label={t.ready.title} data-testid="ready-steps">
        {steps.map((step) => (
          <li
            key={step.key}
            data-state={step.state}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5"
          >
            {step.state === 'done' ? (
              <Check className="size-4 text-success" aria-hidden="true" />
            ) : step.state === 'working' ? (
              <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" />
            ) : step.state === 'failed' ? (
              <CircleAlert className="size-4 text-danger" aria-hidden="true" />
            ) : (
              <Circle className="size-4 text-muted" aria-hidden="true" />
            )}
            <span className="flex-1">{step.label}</span>
            {step.mb > 0 && <span className="text-xs text-muted tabular-nums">~{step.mb} MB</span>}
          </li>
        ))}
      </ol>

      {started && !finished && (
        <div className="mt-4">
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t.ready.progress(percent)}
            className="h-2 overflow-hidden rounded-full bg-surface-secondary"
          >
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1 text-sm text-muted">{t.ready.progress(percent)}</p>
        </div>
      )}

      {message && (
        <p
          role={message.tone === 'danger' ? 'alert' : 'status'}
          data-testid="ready-message"
          className={`mt-6 rounded-xl px-4 py-3 text-sm ${
            message.tone === 'success'
              ? 'bg-success/10 text-success'
              : message.tone === 'warning'
                ? 'bg-warning/10'
                : 'bg-danger/10 text-danger'
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {!finished && (
          <Button variant="primary" isPending={busy} onPress={() => void start()}>
            {started ? t.ready.again : t.ready.start}
          </Button>
        )}
        {finished && (
          <Link to="/courses" className="button button--primary">
            {t.ready.goToCourses}
          </Link>
        )}
      </div>
    </article>
  );
}

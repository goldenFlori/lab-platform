import { Button } from '@heroui/react';
import { Link } from '@tanstack/react-router';
import { Download, MonitorCheck, QrCode as QrIcon } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../i18n';
import { COURSE_LIBRARIES, deviceReady, ENGINE_MB } from '../lib/device-ready';
import { QrCode } from './QrCode';

// The get-ready page (#191) where it is needed: staff share it before the first class (a link, and a
// QR code for the projector); a student sees a prompt until this device is ready.

const TOTAL_MB = ENGINE_MB + COURSE_LIBRARIES.reduce((n, l) => n + l.mb, 0);

export function GetReadyCard() {
  const t = useT();
  const [qr, setQr] = useState(false);
  const url = `${location.origin}/ready`;
  return (
    <section
      aria-labelledby="get-ready"
      className="mt-8 rounded-3xl border border-border bg-surface p-5 shadow-surface sm:p-7"
    >
      <h2 id="get-ready" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <MonitorCheck className="size-5 text-accent" aria-hidden="true" /> {t.ready.staffTitle}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{t.ready.staffText(TOTAL_MB)}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <code className="rounded-lg bg-surface-secondary px-3 py-1.5 text-sm">{url}</code>
        <Link to="/ready" className="button button--secondary button--sm">
          {t.ready.open}
        </Link>
        <Button size="sm" variant="ghost" aria-expanded={qr} onPress={() => setQr(!qr)}>
          <QrIcon className="size-4" /> {qr ? t.ready.hideQr : t.ready.showQr}
        </Button>
      </div>
      {qr && <QrCode value={url} label={t.ready.qrLabel} className="mt-4 size-56 max-w-full rounded-xl" />}
    </section>
  );
}

export function GetReadyPrompt() {
  const t = useT();
  // Read once: the page is where it changes.
  const [ready] = useState(deviceReady);
  if (ready) return null;
  return (
    <Link
      to="/ready"
      data-testid="get-ready-prompt"
      className="mt-6 flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft/40 px-4 py-3 text-sm hover:border-accent"
    >
      <Download className="size-5 shrink-0 text-accent" aria-hidden="true" />
      <span>
        <span className="block font-semibold">{t.ready.studentTitle}</span>
        <span className="text-muted">{t.ready.studentText(TOTAL_MB)}</span>
      </span>
    </Link>
  );
}

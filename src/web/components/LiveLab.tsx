import { Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { QrCode as QrIcon, Radio, Users } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../i18n';
import { liveQuery, useLiveChanges, useLiveSocket } from '../lib/live';
import { QrCode } from './QrCode';

// A lab taught live (#65). Staff who may host start the session here; the host and assistants see
// who is connected and show a QR code that brings students into the lab and the session. Students
// see a banner and join with one tap, or at once when they came from the QR code.

export function LiveLab({
  org,
  courseId,
  labId,
  autoJoin,
}: {
  org: string;
  courseId: string;
  labId: string;
  autoJoin: boolean;
}) {
  const t = useT();
  const query = useQuery(liveQuery(org, courseId, labId));
  const changes = useLiveChanges(org, courseId, labId);
  const [joined, setJoined] = useState(autoJoin);
  const [showQr, setShowQr] = useState(false);
  const session = query.data?.session ?? null;
  const staff = session !== null && session.role !== 'student';
  const socket = useLiveSocket(org, courseId, labId, session && (staff || joined) ? session.id : null, () => {
    void query.refetch();
  });

  if (!query.data) return null;
  if (!session) {
    return query.data.canHost ? (
      <Button variant="tertiary" onPress={() => changes.start.mutate()} isPending={changes.start.isPending}>
        <Radio className="size-4" /> {t.live.start}
      </Button>
    ) : null;
  }

  if (staff) {
    const link = `${location.origin}/o/${org}/courses/${courseId}/labs/${labId}?live=1`;
    const students = socket.presence?.students ?? 0;
    return (
      <section
        aria-label={t.live.title}
        data-testid="live-host"
        className="w-full rounded-2xl border border-accent/40 bg-accent-soft/40 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-semibold">
            <span className="size-2.5 animate-pulse rounded-full bg-danger" aria-hidden="true" />
            {t.live.title}
            <span className="font-normal text-muted" data-testid="live-count" aria-live="polite">
              · {t.live.connected(students)}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onPress={() => setShowQr(!showQr)} aria-pressed={showQr}>
              <QrIcon className="size-4" /> {t.live.qr}
            </Button>
            {query.data.canHost && (
              <Button
                size="sm"
                variant="danger-soft"
                onPress={() => changes.end.mutate(session.id)}
                isPending={changes.end.isPending}
              >
                {t.live.end}
              </Button>
            )}
          </div>
        </div>
        {showQr && (
          <div className="mt-4 flex flex-col items-center gap-2 text-center">
            <QrCode value={link} label={t.live.qrLabel} className="w-56 max-w-full rounded-xl" />
            <p className="text-sm text-muted">{t.live.scan}</p>
          </div>
        )}
        {socket.presence && socket.presence.names.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="flex cursor-pointer items-center gap-1.5 text-muted">
              <Users className="size-4" aria-hidden="true" /> {t.live.who}
            </summary>
            <p className="mt-2">{socket.presence.names.join(', ')}</p>
          </details>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label={t.live.title}
      data-testid="live-student"
      className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent-soft/40 px-4 py-3"
    >
      <p className="flex items-center gap-2 text-sm">
        <span className="size-2.5 animate-pulse rounded-full bg-danger" aria-hidden="true" />
        {joined && socket.state === 'open' ? t.live.joined : t.live.running(session.hostName)}
      </p>
      {joined ? (
        <Button size="sm" variant="ghost" onPress={() => setJoined(false)}>
          {t.live.leave}
        </Button>
      ) : (
        <Button size="sm" variant="primary" onPress={() => setJoined(true)}>
          {t.live.join}
        </Button>
      )}
    </section>
  );
}

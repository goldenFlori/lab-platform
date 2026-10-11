import { Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { QrCode as QrIcon, Radio, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { liveQuery, useLiveChanges, useLiveSocket } from '../lib/live';
import { QrCode } from './QrCode';

// A lab taught live (#65). Staff who may host start the session here; the host and assistants see
// who is connected and show a QR code that brings students into the lab and the session. Students
// see a banner and join with one tap, or at once when they came from the QR code.
//
// Following the host (#66): the host's page says which cell it is on (where its scrolling stops;
// the presenter says each step), and joined students' pages go there, switching notebook if needed,
// until they choose to work on their own.

/** The cell at this position in the notebook shown: scrolls to it once it is on the page. */
function goToCell(at: number) {
  let tries = 0;
  const look = () => {
    const marker = document.querySelector(`[data-at="${at}"]`);
    const target = marker?.firstElementChild;
    if (target) return target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (tries++ < 50) setTimeout(look, 100);
  };
  look();
}

/** The cell nearest the top of the window, below the site header. */
function cellInView() {
  for (const marker of document.querySelectorAll<HTMLElement>('[data-at]')) {
    const box = marker.firstElementChild?.getBoundingClientRect();
    if (box && box.bottom > 120) return Number(marker.dataset.at);
  }
  return null;
}

export function LiveLab({
  org,
  courseId,
  labId,
  autoJoin,
  notebookId,
  onNotebook,
}: {
  org: string;
  courseId: string;
  labId: string;
  autoJoin: boolean;
  /** The notebook shown, and how to show another one, for following the host. */
  notebookId: string | null;
  onNotebook: (id: string) => void;
}) {
  const t = useT();
  const query = useQuery(liveQuery(org, courseId, labId));
  const changes = useLiveChanges(org, courseId, labId);
  const [joined, setJoined] = useState(autoJoin);
  const [showQr, setShowQr] = useState(false);
  const [following, setFollowing] = useState(true);
  const session = query.data?.session ?? null;
  const staff = session !== null && session.role !== 'student';
  const socket = useLiveSocket(org, courseId, labId, session && (staff || joined) ? session.id : null, () => {
    void query.refetch();
  });

  const isHost = session?.role === 'host';
  const { step, send, state } = socket;

  // A student who follows goes where the host is.
  // biome-ignore lint/correctness/useExhaustiveDependencies: moves only when the host moves, or on rejoining
  useEffect(() => {
    if (staff || !joined || !following || !step) return;
    if (step.notebook !== notebookId) onNotebook(step.notebook);
    goToCell(step.at);
  }, [step, following, joined, staff]);

  // The host's page says where it is once its scrolling settles.
  useEffect(() => {
    if (!isHost || state !== 'open' || !notebookId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last: number | null = null;
    const settle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const at = cellInView();
        if (at === null || at === last) return;
        last = at;
        send({ t: 'step', notebook: notebookId, at });
      }, 600);
    };
    settle();
    window.addEventListener('scroll', settle, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', settle);
    };
  }, [isHost, state, notebookId, send]);

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
        {joined && socket.state === 'open'
          ? following
            ? t.live.following
            : t.live.onYourOwn
          : t.live.running(session.hostName)}
      </p>
      {joined ? (
        <div className="flex flex-wrap gap-2">
          {following ? (
            <Button size="sm" variant="secondary" onPress={() => setFollowing(false)}>
              {t.live.detach}
            </Button>
          ) : (
            <Button size="sm" variant="primary" onPress={() => setFollowing(true)}>
              {t.live.follow}
            </Button>
          )}
          <Button size="sm" variant="ghost" onPress={() => setJoined(false)}>
            {t.live.leave}
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="primary" onPress={() => setJoined(true)}>
          {t.live.join}
        </Button>
      )}
    </section>
  );
}

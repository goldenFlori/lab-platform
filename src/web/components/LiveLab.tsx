import { Button } from '@heroui/react';
import { CircleCheck, CircleX, Hourglass, QrCode as QrIcon, Radio, Trophy, Users } from 'lucide-react';
import { useState } from 'react';
import type { LiveBoard } from '../../shared/live';
import { useT } from '../i18n';
import { goTo, useLive } from '../lib/live-context';
import { QrCode } from './QrCode';

// A lab taught live (#65), in the lab page's header. Staff who may host start the session here;
// the host and assistants see who is connected, show a QR code that brings students into the lab
// and the session, and follow a running challenge's board (#67). Students see a banner, join with
// one tap (or at once from the QR code), follow the host (#66) and see the challenge.

export function LiveLab({ org, courseId, labId }: { org: string; courseId: string; labId: string }) {
  const t = useT();
  const live = useLive();
  const [showQr, setShowQr] = useState(false);
  if (!live?.state) return null;
  const { session, socket, changes, challengeHere } = live;

  if (!session) {
    return live.state.canHost ? (
      <Button variant="tertiary" onPress={() => changes.start.mutate()} isPending={changes.start.isPending}>
        <Radio className="size-4" /> {t.live.start}
      </Button>
    ) : null;
  }

  if (live.staff) {
    const link = `${location.origin}/o/${org}/courses/${courseId}/labs/${labId}?live=1`;
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
              · {t.live.connected(socket.presence?.students ?? 0)}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onPress={() => setShowQr(!showQr)} aria-pressed={showQr}>
              <QrIcon className="size-4" /> {t.live.qr}
            </Button>
            {live.state.canHost && (
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
        {challengeHere && <Board title={challengeHere.title} board={socket.board} onStop={live.stopChallenge} />}
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

  const { joined, following } = live;
  return (
    <section
      aria-label={t.live.title}
      data-testid="live-student"
      className="w-full rounded-2xl border border-accent/40 bg-accent-soft/40 px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
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
              <Button size="sm" variant="secondary" onPress={() => live.setFollowing(false)}>
                {t.live.detach}
              </Button>
            ) : (
              <Button size="sm" variant="primary" onPress={() => live.setFollowing(true)}>
                {t.live.follow}
              </Button>
            )}
            <Button size="sm" variant="ghost" onPress={() => live.setJoined(false)}>
              {t.live.leave}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="primary" onPress={() => live.setJoined(true)}>
            {t.live.join}
          </Button>
        )}
      </div>
      {joined && challengeHere && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2">
          <p className="flex items-center gap-2 text-sm font-semibold" data-testid="live-challenge">
            <Trophy className="size-4 text-warning" aria-hidden="true" /> {t.live.challenge(challengeHere.title)}
          </p>
          <Button size="sm" variant="secondary" onPress={() => goTo(`[data-src="${challengeHere.cell}"]`)}>
            {t.live.goToChallenge}
          </Button>
        </div>
      )}
    </section>
  );
}

/** How the room is doing on the challenge: counts, the most common error, names on request. */
function Board({ title, board, onStop }: { title: string; board: LiveBoard | null; onStop: () => void }) {
  const t = useT();
  const [names, setNames] = useState(false);
  return (
    <div className="mt-4 rounded-xl bg-surface p-3" data-testid="live-board">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Trophy className="size-4 text-warning" aria-hidden="true" /> {t.live.challenge(title)}
        </p>
        <Button size="sm" variant="ghost" onPress={onStop}>
          {t.live.stopChallenge}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-lg font-semibold tabular-nums" aria-live="polite">
        <span className="flex items-center gap-1.5 text-success" data-testid="board-passed">
          <CircleCheck className="size-5" aria-hidden="true" /> {board?.passed ?? 0}
        </span>
        <span className="flex items-center gap-1.5 text-danger" data-testid="board-failed">
          <CircleX className="size-5" aria-hidden="true" /> {board?.failed ?? 0}
        </span>
        <span className="flex items-center gap-1.5 text-muted">
          <Hourglass className="size-5" aria-hidden="true" /> {board?.waiting ?? 0}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">{t.live.boardKey}</p>
      {board?.topError && (
        <p className="mt-2 text-sm" data-testid="board-error">
          {t.live.topError(board.topError.type, board.topError.count)}
        </p>
      )}
      {board && board.passed + board.failed > 0 && (
        <div className="mt-2 text-sm">
          <Button size="sm" variant="ghost" onPress={() => setNames(!names)} aria-pressed={names}>
            {names ? t.live.hideNames : t.live.showNames}
          </Button>
          {names && (
            <div className="mt-1 grid gap-1">
              <p className="text-success">✓ {board.names.passed.join(', ') || '—'}</p>
              <p className="text-danger">✗ {board.names.failed.join(', ') || '—'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

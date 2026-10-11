import { useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import type { LiveResult, Reaction } from '../../shared/live';
import { liveQuery, useLiveChanges, useLiveSocket } from './live';

// A lab taught live, for the whole lab page (#65–#67): the session, the socket, following the host,
// and challenges. The panel in the header, the exercise cells and the runs all read it from here.

/** Scrolls to the first element on the page that `selector` marks, once it is there. */
export function goTo(selector: string) {
  let tries = 0;
  const look = () => {
    const target = document.querySelector(selector)?.firstElementChild;
    if (target) return target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (tries++ < 50) setTimeout(look, 100);
  };
  look();
}

/** The heading of the section the student is reading, to say where they are stuck (#68). */
function whereNow() {
  const at = cellInView();
  if (at === null) return '';
  const markers = [...document.querySelectorAll<HTMLElement>('[data-at]')].filter((m) => Number(m.dataset.at) <= at);
  for (const marker of markers.reverse()) {
    const heading = marker.querySelector('h2, h3');
    if (heading?.textContent) return heading.textContent.trim();
  }
  return '';
}

/** The cell nearest the top of the window, below the site header. */
function cellInView() {
  for (const marker of document.querySelectorAll<HTMLElement>('[data-at]')) {
    const box = marker.firstElementChild?.getBoundingClientRect();
    if (box && box.bottom > 120) return Number(marker.dataset.at);
  }
  return null;
}

function useLiveValue({
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
  notebookId: string | null;
  onNotebook: (id: string) => void;
}) {
  const query = useQuery(liveQuery(org, courseId, labId));
  const changes = useLiveChanges(org, courseId, labId);
  const [joined, setJoined] = useState(autoJoin);
  const [following, setFollowing] = useState(true);
  const session = query.data?.session ?? null;
  const staff = session !== null && session.role !== 'student';
  const isHost = session?.role === 'host';
  const socket = useLiveSocket(org, courseId, labId, session && (staff || joined) ? session.id : null, () => {
    void query.refetch();
  });
  const { step, send, state, challenge } = socket;

  // A student who follows goes where the host is.
  // biome-ignore lint/correctness/useExhaustiveDependencies: moves only when the host moves, or on rejoining
  useEffect(() => {
    if (staff || !joined || !following || !step) return;
    if (step.notebook !== notebookId) onNotebook(step.notebook);
    goTo(`[data-at="${step.at}"]`);
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

  return {
    state: query.data,
    refetch: query.refetch,
    changes,
    session,
    staff,
    isHost,
    joined,
    setJoined,
    following,
    setFollowing,
    socket,
    notebookId,
    /** The running challenge, when it is on the notebook shown. */
    challengeHere: challenge && challenge.notebook === notebookId ? challenge : null,
    startChallenge: (cell: number, title: string) => {
      if (notebookId) send({ t: 'challenge', notebook: notebookId, cell, title });
    },
    stopChallenge: () => send({ t: 'challenge-stop' }),
    askHelp: () => send({ t: 'help', where: whereNow() }),
    cancelHelp: () => send({ t: 'help-cancel' }),
    takeHelp: (id: string) => send({ t: 'help-take', id }),
    closeHelp: (id: string) => send({ t: 'help-done', id }),
    react: (emoji: Reaction) => send({ t: 'react', emoji }),
    /** A joined student's check of the challenge: only its result goes. */
    report: (result: Omit<LiveResult, 't'>) => {
      if (!staff && joined && challenge && challenge.notebook === notebookId && challenge.cell === result.cell)
        send({ t: 'result', ...result });
    },
  };
}

export type LiveValue = ReturnType<typeof useLiveValue>;

const LiveContext = createContext<LiveValue | null>(null);

export function LiveProvider({ children, ...props }: Parameters<typeof useLiveValue>[0] & { children: ReactNode }) {
  const value = useLiveValue(props);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

/** The lab's Live Lab, on the lab page; null elsewhere. */
export function useLive() {
  return useContext(LiveContext);
}

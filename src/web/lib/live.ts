import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LiveBoard,
  LiveChallenge,
  LiveHelpQueue,
  LiveHelpState,
  LiveMessage,
  LivePresence,
  LiveQuiz,
  LiveQuizReveal,
  LiveQuizTally,
  LiveState,
  LiveStep,
  Reaction,
} from '../../shared/live';
import { api } from './api';

// Live Lab sessions (#65): whether a lab is taught live now, starting and ending it, and the
// session's socket. Students do not poll: the page checks when it opens and when it comes back
// into focus, so a class of 120 stays far inside the free requests.

/** The running quick question (#87): what this user chose, the staff's tally, and the reveal. */
export type QuizState = {
  quiz: LiveQuiz;
  mine: number | null;
  tally: LiveQuizTally | null;
  reveal: LiveQuizReveal | null;
};

const livePath = (org: string, courseId: string, labId: string) =>
  `/orgs/${encodeURIComponent(org)}/courses/${encodeURIComponent(courseId)}/labs/${encodeURIComponent(labId)}/live`;

export const liveQuery = (org: string, courseId: string, labId: string) =>
  queryOptions({
    queryKey: ['orgs', org, 'courses', courseId, 'labs', labId, 'live'],
    queryFn: () => api<LiveState>(livePath(org, courseId, labId)),
    staleTime: 0,
  });

export function useLiveChanges(org: string, courseId: string, labId: string) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: liveQuery(org, courseId, labId).queryKey });
  return {
    start: useMutation({
      mutationFn: () => api<void>(livePath(org, courseId, labId), { method: 'POST' }),
      onSuccess: refresh,
    }),
    end: useMutation({
      mutationFn: (sessionId: string) =>
        api<void>(`${livePath(org, courseId, labId)}/${encodeURIComponent(sessionId)}/end`, { method: 'POST' }),
      onSuccess: refresh,
    }),
  };
}

export type SocketState = 'connecting' | 'open' | 'closed';

/** How long a reaction counts on the staff's screens. */
const REACTION_MS = 8000;

/** A keepalive the session answers without waking up. */
const PING_MS = 45_000;

/**
 * The session's socket while `sessionId` is set: reconnects after a drop, with growing pauses.
 * Every drop calls `onDrop`, which checks whether the session still runs: once the host ends it,
 * `sessionId` goes and the socket with it.
 */
export function useLiveSocket(
  org: string,
  courseId: string,
  labId: string,
  sessionId: string | null,
  onDrop: () => void,
) {
  const [state, setState] = useState<SocketState>('closed');
  const [presence, setPresence] = useState<LivePresence | null>(null);
  const [step, setStep] = useState<LiveStep | null>(null);
  const [challenge, setChallenge] = useState<LiveChallenge | null>(null);
  const [board, setBoard] = useState<LiveBoard | null>(null);
  const [helpQueue, setHelpQueue] = useState<LiveHelpQueue['items']>([]);
  const [help, setHelp] = useState<LiveHelpState | null>(null);
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  // Reactions of the last few seconds, as passing counts.
  const [reactions, setReactions] = useState<Partial<Record<Reaction, number>>>({});
  const socketRef = useRef<WebSocket | null>(null);
  const dropped = useRef(onDrop);
  dropped.current = onDrop;

  useEffect(() => {
    if (!sessionId) return;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let attempts = 0;
    let stopped = false;
    const url = `${location.origin.replace(/^http/, 'ws')}/api${livePath(org, courseId, labId)}/${encodeURIComponent(sessionId)}/ws`;

    const open = () => {
      setState('connecting');
      socket = new WebSocket(url);
      socketRef.current = socket;
      socket.onopen = () => {
        attempts = 0;
        setState('open');
        ping = setInterval(() => socket?.send('ping'), PING_MS);
      };
      socket.onmessage = (event) => {
        if (event.data === 'pong') return;
        const message = JSON.parse(String(event.data)) as LiveMessage;
        if (message.t === 'presence') setPresence(message);
        if (message.t === 'step') setStep(message);
        if (message.t === 'challenge') {
          setChallenge(message);
          setBoard(null);
        }
        if (message.t === 'challenge-stop') setChallenge(null);
        if (message.t === 'board') setBoard(message);
        if (message.t === 'help-queue') setHelpQueue(message.items);
        if (message.t === 'help-state') setHelp(message);
        // The same kinds the host sends carry an id when they come from the session.
        if (message.t === 'quiz' && 'id' in message) {
          const same = (q: QuizState | null) => (q?.quiz.id === message.id ? q : null);
          setQuiz((q) => ({
            quiz: message,
            mine: same(q)?.mine ?? null,
            tally: same(q)?.tally ?? null,
            reveal: same(q)?.reveal ?? null,
          }));
        }
        if (message.t === 'quiz-mine') setQuiz((q) => (q?.quiz.id === message.id ? { ...q, mine: message.choice } : q));
        if (message.t === 'quiz-tally') setQuiz((q) => (q?.quiz.id === message.id ? { ...q, tally: message } : q));
        if (message.t === 'quiz-reveal' && 'id' in message)
          setQuiz((q) => (q?.quiz.id === message.id ? { ...q, reveal: message } : q));
        if (message.t === 'quiz-stop') setQuiz(null);
        if (message.t === 'react') {
          const { emoji } = message;
          setReactions((r) => ({ ...r, [emoji]: (r[emoji] ?? 0) + 1 }));
          setTimeout(() => setReactions((r) => ({ ...r, [emoji]: Math.max(0, (r[emoji] ?? 1) - 1) })), REACTION_MS);
        }
        if (message.t === 'ended') {
          stopped = true;
          dropped.current();
        }
      };
      socket.onclose = (event) => {
        clearInterval(ping);
        setState('closed');
        if (stopped) return;
        dropped.current();
        if (event.code === 4000) return;
        attempts++;
        retry = setTimeout(open, Math.min(10_000, 1000 * 2 ** Math.min(attempts, 4)));
      };
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(ping);
      socket?.close(1000);
      socketRef.current = null;
      setState('closed');
      setPresence(null);
      setStep(null);
      setChallenge(null);
      setBoard(null);
      setHelpQueue([]);
      setHelp(null);
      setQuiz(null);
      setReactions({});
    };
  }, [org, courseId, labId, sessionId]);

  /** Sends a message if the socket is open; the session ignores what the sender may not say. */
  const send = useCallback((message: LiveMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  return { state, presence, step, challenge, board, helpQueue, help, quiz, reactions, send };
}

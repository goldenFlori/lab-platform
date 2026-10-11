import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { LiveMessage, LivePresence, LiveState } from '../../shared/live';
import { api } from './api';

// Live Lab sessions (#65): whether a lab is taught live now, starting and ending it, and the
// session's socket. Students do not poll: the page checks when it opens and when it comes back
// into focus, so a class of 120 stays far inside the free requests.

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
      socket.onopen = () => {
        attempts = 0;
        setState('open');
        ping = setInterval(() => socket?.send('ping'), PING_MS);
      };
      socket.onmessage = (event) => {
        if (event.data === 'pong') return;
        const message = JSON.parse(String(event.data)) as LiveMessage;
        if (message.t === 'presence') setPresence(message);
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
      setState('closed');
      setPresence(null);
    };
  }, [org, courseId, labId, sessionId]);

  return { state, presence };
}

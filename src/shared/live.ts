// Live Lab sessions (#65): what the API and the session's sockets say. Types only.

/** A role in the room: whoever started it hosts; other staff assist; the rest are students. */
export type LiveRole = 'host' | 'assistant' | 'student';

/** The running session of a lab, if any, and whether this user may start one. */
export type LiveState = {
  session: { id: string; startedAt: string; hostName: string; role: LiveRole } | null;
  canHost: boolean;
};

/** To the host and assistants: who is connected. Names reach staff only. */
export type LivePresence = { t: 'presence'; students: number; staff: number; names: string[] };

export type LiveMessage = LivePresence;

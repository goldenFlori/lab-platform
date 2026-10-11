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

/**
 * The step the host is on (#66): a notebook and the position of a cell in it. Sent by the host;
 * passed to everyone else, and to each newcomer, so students' pages follow.
 */
export type LiveStep = { t: 'step'; notebook: string; at: number };

/** A live challenge on an exercise (#67): started and stopped by the host, shown to everyone. */
export type LiveChallenge = { t: 'challenge'; notebook: string; cell: number; title: string };
export type LiveChallengeStop = { t: 'challenge-stop' };

/**
 * A student's check of the challenge's exercise: only its result, the error's type and how long it
 * took; never code or keystrokes.
 */
export type LiveResult = {
  t: 'result';
  cell: number;
  status: 'pass' | 'fail' | 'todo' | 'error';
  error: string | null;
  ms: number;
};

/** To the host and assistants: how the room is doing on the challenge. Names reach staff only. */
export type LiveBoard = {
  t: 'board';
  passed: number;
  failed: number;
  /** Connected students without a result yet, or not finished. */
  waiting: number;
  topError: { type: string; count: number } | null;
  names: { passed: string[]; failed: string[] };
};

/** To everyone: the host ended the session. */
export type LiveEnded = { t: 'ended' };

export type LiveMessage =
  | LivePresence
  | LiveEnded
  | LiveStep
  | LiveChallenge
  | LiveChallengeStop
  | LiveResult
  | LiveBoard;

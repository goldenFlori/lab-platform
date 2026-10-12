// Live Lab sessions (#65): what the API and the session's sockets say. Types, and the reactions.

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

/** Help requests (#68): a student asks or cancels; staff take and close. */
export type LiveHelp = { t: 'help'; where: string } | { t: 'help-cancel' };
export type LiveHelpTake = { t: 'help-take'; id: string } | { t: 'help-done'; id: string };

/** To staff: the queue, oldest first. `id` is the student's account. */
export type LiveHelpQueue = {
  t: 'help-queue';
  items: { id: string; name: string; where: string; since: string; takenBy: string | null }[];
};

/** To the student who asked: whether they wait, or who is coming. */
export type LiveHelpState = { t: 'help-state'; status: 'waiting' | 'taken' | null; by: string | null };

export const REACTIONS = ['👍', '❓', '🎉'] as const;
export type Reaction = (typeof REACTIONS)[number];

/** A student's reaction (#68), passed to the staff; one per student every few seconds. */
export type LiveReact = { t: 'react'; emoji: Reaction };

/**
 * A quick question (#87). The host sends it with the right option; everyone gets it with an id,
 * students without the answer (`correct` null) until the host reveals it.
 */
export type LiveQuizStart = { t: 'quiz'; question: string; options: string[]; correct: number };
export type LiveQuiz = { t: 'quiz'; id: string; question: string; options: string[]; correct: number | null };

/** A student's answer: the first one counts. */
export type LiveAnswer = { t: 'answer'; id: string; choice: number };

/** To the student who answered (also when they come back): their choice. */
export type LiveQuizMine = { t: 'quiz-mine'; id: string; choice: number };

/** To staff: how the room answered, per option, and who, by option. Names reach staff only. */
export type LiveQuizTally = { t: 'quiz-tally'; id: string; counts: number[]; waiting: number; names: string[][] };

/** To everyone, once the host reveals it: the right option and the counts. */
export type LiveQuizReveal = { t: 'quiz-reveal'; id: string; correct: number; counts: number[] };

export type LiveQuizStop = { t: 'quiz-stop' };

/** From the host: show the right option to everyone. */
export type LiveQuizRevealRequest = { t: 'quiz-reveal' };

/** Limits on a question, kept within a socket message. */
export const QUIZ_LIMITS = { question: 300, option: 120, minOptions: 2, maxOptions: 4 } as const;

/** To everyone: the host ended the session. */
export type LiveEnded = { t: 'ended' };

export type LiveMessage =
  | LivePresence
  | LiveEnded
  | LiveStep
  | LiveChallenge
  | LiveChallengeStop
  | LiveResult
  | LiveBoard
  | LiveHelp
  | LiveHelpTake
  | LiveHelpQueue
  | LiveHelpState
  | LiveReact
  | LiveQuiz
  | LiveQuizStart
  | LiveAnswer
  | LiveQuizRevealRequest
  | LiveQuizMine
  | LiveQuizTally
  | LiveQuizReveal
  | LiveQuizStop;

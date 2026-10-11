import { DurableObject } from 'cloudflare:workers';
import {
  type LiveBoard,
  type LiveChallenge,
  type LiveEnded,
  type LiveHelpQueue,
  type LiveHelpState,
  type LivePresence,
  type LiveResult,
  type LiveRole,
  type LiveStep,
  REACTIONS,
} from '../../shared/live';

// One Live Lab session (#65): the connections of everyone in the room. The Worker checks who may
// join and passes them here with their role; this object only holds sockets and passes small
// messages on. It uses WebSocket Hibernation: between messages it sleeps, and the sockets'
// attachments and the storage keep what it needs, so a quiet class costs nothing.
//
// - Presence: the staff learn who is connected (#65).
// - Steps: only the host moves the room; newcomers start where the host is (#66).
// - Challenges: the host starts one on an exercise; students' checks of it send their results,
//   and the staff see the room's board (#67).
// - Help: a student asks, staff take and close; reactions pass to the staff, throttled (#68).

/** Who a socket belongs to, kept with it across hibernation. */
type Member = { userId: string; name: string; role: LiveRole };

/** Each student's latest result in the running challenge. */
type Results = Record<string, { name: string; status: LiveResult['status']; error: string | null }>;

/** The help queue, by student. */
type HelpQueue = Record<string, { name: string; where: string; since: number; takenBy: string | null }>;

/** A student may react once in this long. */
const REACT_EVERY_MS = 3000;

/** Sent by the Worker when it hands a socket over; the object is reachable only through it. */
export const MEMBER_HEADER = 'X-Live-Member';

/** The socket closes with this when the host ends the session. */
export const ENDED = 4000;

const record = (data: unknown) => (data && typeof data === 'object' ? (data as Record<string, unknown>) : null);
const cellNumber = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 10_000;

const helpState = (request: { takenBy: string | null }): LiveHelpState => ({
  t: 'help-state',
  status: request.takenBy ? 'taken' : 'waiting',
  by: request.takenBy,
});

/** A step message as the host may send it; anything else is ignored. */
function parseStep(data: unknown): LiveStep | null {
  const m = record(data);
  if (m?.t !== 'step' || typeof m.notebook !== 'string' || m.notebook.length > 64 || !cellNumber(m.at)) return null;
  return { t: 'step', notebook: m.notebook, at: m.at as number };
}

function parseChallenge(data: unknown): LiveChallenge | null {
  const m = record(data);
  if (m?.t !== 'challenge' || typeof m.notebook !== 'string' || m.notebook.length > 64 || !cellNumber(m.cell))
    return null;
  if (typeof m.title !== 'string' || !m.title.trim() || m.title.length > 160) return null;
  return { t: 'challenge', notebook: m.notebook, cell: m.cell as number, title: m.title };
}

const STATUSES = new Set(['pass', 'fail', 'todo', 'error']);

function parseResult(data: unknown): LiveResult | null {
  const m = record(data);
  if (m?.t !== 'result' || !cellNumber(m.cell) || !STATUSES.has(m.status as string)) return null;
  const error = typeof m.error === 'string' && /^[A-Za-z_][\w.]{0,59}$/.test(m.error) ? m.error : null;
  const ms = Number.isInteger(m.ms) && (m.ms as number) >= 0 ? Math.min(m.ms as number, 600_000) : 0;
  return { t: 'result', cell: m.cell as number, status: m.status as LiveResult['status'], error, ms };
}

export class LiveSession extends DurableObject<Env> {
  /** When each student last reacted; lost when the object sleeps, which only forgives a reaction. */
  private reacted = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // A client's keepalive is answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/end')) {
      // Said before closing: a close code does not always survive the proxies on the way.
      const ended = JSON.stringify({ t: 'ended' } satisfies LiveEnded);
      for (const ws of this.ctx.getWebSockets()) {
        ws.send(ended);
        ws.close(ENDED, 'ended');
      }
      return new Response(null, { status: 204 });
    }
    const member = JSON.parse(request.headers.get(MEMBER_HEADER) ?? 'null') as Member | null;
    if (!member || request.headers.get('Upgrade') !== 'websocket') return new Response(null, { status: 400 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [member.role]);
    server.serializeAttachment(member);
    // A newcomer starts where the host is, and sees the running challenge.
    const [step, challenge] = await Promise.all([
      this.ctx.storage.get<LiveStep>('step'),
      this.ctx.storage.get<LiveChallenge>('challenge'),
    ]);
    if (step && member.role !== 'host') server.send(JSON.stringify(step));
    if (challenge) server.send(JSON.stringify(challenge));
    if (member.role === 'student') {
      const request = (await this.helpQueue())[member.userId];
      if (request) server.send(JSON.stringify(helpState(request)));
    } else {
      server.send(JSON.stringify(await this.queueMessage()));
    }
    await this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string' || message.length > 2000) return;
    const member = ws.deserializeAttachment() as Member;
    let data: unknown;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (member.role === 'host') {
      const step = parseStep(data);
      if (step) {
        await this.ctx.storage.put('step', step);
        this.sendAll(step, ws);
        return;
      }
      const challenge = parseChallenge(data);
      if (challenge) {
        await this.ctx.storage.put({ challenge, results: {} satisfies Results });
        this.sendAll(challenge);
        await this.broadcastBoard();
        return;
      }
      if (record(data)?.t === 'challenge-stop') {
        await this.ctx.storage.delete(['challenge', 'results']);
        this.sendAll({ t: 'challenge-stop' });
        return;
      }
    }

    const m = record(data);
    if (member.role !== 'student' && (m?.t === 'help-take' || m?.t === 'help-done') && typeof m.id === 'string') {
      const queue = await this.helpQueue();
      const request = queue[m.id];
      if (!request) return;
      if (m.t === 'help-take') request.takenBy = member.name;
      else delete queue[m.id];
      await this.ctx.storage.put('help', queue);
      this.sendTo(m.id, m.t === 'help-take' ? helpState(request) : { t: 'help-state', status: null, by: null });
      this.sendStaff(await this.queueMessage());
      return;
    }
    if (member.role === 'student' && m?.t === 'help') {
      const where = typeof m.where === 'string' ? m.where.trim().slice(0, 120) : '';
      const queue = await this.helpQueue();
      queue[member.userId] ??= { name: member.name, where, since: Date.now(), takenBy: null };
      await this.ctx.storage.put('help', queue);
      this.sendTo(member.userId, helpState(queue[member.userId]));
      this.sendStaff(await this.queueMessage());
      return;
    }
    if (member.role === 'student' && m?.t === 'help-cancel') {
      const queue = await this.helpQueue();
      delete queue[member.userId];
      await this.ctx.storage.put('help', queue);
      this.sendTo(member.userId, { t: 'help-state', status: null, by: null });
      this.sendStaff(await this.queueMessage());
      return;
    }
    if (member.role === 'student' && m?.t === 'react' && (REACTIONS as readonly unknown[]).includes(m.emoji)) {
      const now = Date.now();
      if (now - (this.reacted.get(member.userId) ?? 0) < REACT_EVERY_MS) return;
      this.reacted.set(member.userId, now);
      this.sendStaff({ t: 'react', emoji: m.emoji });
      return;
    }

    const result = member.role === 'student' ? parseResult(data) : null;
    if (result) {
      const challenge = await this.ctx.storage.get<LiveChallenge>('challenge');
      if (!challenge || challenge.cell !== result.cell) return;
      const results = (await this.ctx.storage.get<Results>('results')) ?? {};
      results[member.userId] = { name: member.name, status: result.status, error: result.error };
      await this.ctx.storage.put('results', results);
      await this.broadcastBoard();
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    if (code !== ENDED) ws.close(code === 1006 ? 1000 : code, 'bye');
    await this.broadcastPresence(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.broadcastPresence(ws);
  }

  private open(leaving?: WebSocket) {
    return this.ctx.getWebSockets().filter((ws) => ws !== leaving && ws.readyState === WebSocket.OPEN);
  }

  private sendAll(message: object, except?: WebSocket) {
    const text = JSON.stringify(message);
    for (const ws of this.open()) if (ws !== except) ws.send(text);
  }

  /** To every socket of one user. */
  private sendTo(userId: string, message: object) {
    const text = JSON.stringify(message);
    for (const ws of this.open()) if ((ws.deserializeAttachment() as Member).userId === userId) ws.send(text);
  }

  private async helpQueue() {
    return (await this.ctx.storage.get<HelpQueue>('help')) ?? {};
  }

  private async queueMessage(): Promise<LiveHelpQueue> {
    const items = Object.entries(await this.helpQueue())
      .sort(([, a], [, b]) => a.since - b.since)
      .map(([id, r]) => ({
        id,
        name: r.name,
        where: r.where,
        since: new Date(r.since).toISOString(),
        takenBy: r.takenBy,
      }));
    return { t: 'help-queue', items };
  }

  private sendStaff(message: object, leaving?: WebSocket) {
    const text = JSON.stringify(message);
    for (const ws of this.open(leaving)) {
      if ((ws.deserializeAttachment() as Member).role !== 'student') ws.send(text);
    }
  }

  /** Connected students, one entry per person though they may have two tabs open. */
  private students(leaving?: WebSocket) {
    const members = this.open(leaving).map((ws) => ws.deserializeAttachment() as Member);
    return {
      students: new Map(members.filter((m) => m.role === 'student').map((m) => [m.userId, m.name])),
      staff: new Set(members.filter((m) => m.role !== 'student').map((m) => m.userId)).size,
    };
  }

  /** The staff in the room learn how many are connected, and the students' names. */
  private async broadcastPresence(leaving?: WebSocket) {
    const { students, staff } = this.students(leaving);
    const presence: LivePresence = {
      t: 'presence',
      students: students.size,
      staff,
      names: [...students.values()].sort((a, b) => a.localeCompare(b)),
    };
    this.sendStaff(presence, leaving);
    await this.broadcastBoard(leaving);
  }

  /** How the room is doing on the running challenge, for the staff. */
  private async broadcastBoard(leaving?: WebSocket) {
    const challenge = await this.ctx.storage.get<LiveChallenge>('challenge');
    if (!challenge) return;
    const results = (await this.ctx.storage.get<Results>('results')) ?? {};
    const { students } = this.students(leaving);
    const entries = Object.entries(results);
    const passed = entries.filter(([, r]) => r.status === 'pass');
    const failed = entries.filter(([, r]) => r.status === 'fail' || r.status === 'error');
    const done = new Set([...passed, ...failed].map(([id]) => id));
    const errors = new Map<string, number>();
    for (const [, r] of failed) {
      const type = r.status === 'fail' ? 'AssertionError' : (r.error ?? 'Error');
      errors.set(type, (errors.get(type) ?? 0) + 1);
    }
    const top = [...errors].sort((a, b) => b[1] - a[1])[0];
    const byName = (list: typeof entries) => list.map(([, r]) => r.name).sort((a, b) => a.localeCompare(b));
    const board: LiveBoard = {
      t: 'board',
      passed: passed.length,
      failed: failed.length,
      waiting: [...students.keys()].filter((id) => !done.has(id)).length,
      topError: top ? { type: top[0], count: top[1] } : null,
      names: { passed: byName(passed), failed: byName(failed) },
    };
    this.sendStaff(board, leaving);
  }
}

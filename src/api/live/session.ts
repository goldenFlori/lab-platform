import { DurableObject } from 'cloudflare:workers';
import type { LivePresence, LiveRole } from '../../shared/live';

// One Live Lab session (#65): the connections of everyone in the room. The Worker checks who may
// join and passes them here with their role; this object only holds sockets and tells the staff
// who is connected. It uses WebSocket Hibernation: between messages it sleeps, and the sockets'
// attachments keep who is who, so a quiet class costs nothing. Messages stay small: events, never
// streams.

/** Who a socket belongs to, kept with it across hibernation. */
type Member = { userId: string; name: string; role: LiveRole };

/** Sent by the Worker when it hands a socket over; the object is reachable only through it. */
export const MEMBER_HEADER = 'X-Live-Member';

/** The socket closes with this when the host ends the session. */
export const ENDED = 4000;

export class LiveSession extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // A client's keepalive is answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/end')) {
      for (const ws of this.ctx.getWebSockets()) ws.close(ENDED, 'ended');
      return new Response(null, { status: 204 });
    }
    const member = JSON.parse(request.headers.get(MEMBER_HEADER) ?? 'null') as Member | null;
    if (!member || request.headers.get('Upgrade') !== 'websocket') return new Response(null, { status: 400 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [member.role]);
    server.serializeAttachment(member);
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer) {
    // Nothing to say yet; follow mode, challenges and help requests add their messages (#66–#68).
  }

  async webSocketClose(ws: WebSocket, code: number) {
    if (code !== ENDED) ws.close(code === 1006 ? 1000 : code, 'bye');
    this.broadcastPresence(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.broadcastPresence(ws);
  }

  /** The staff in the room learn how many are connected, and the students' names. */
  private broadcastPresence(leaving?: WebSocket) {
    const open = this.ctx.getWebSockets().filter((ws) => ws !== leaving && ws.readyState === WebSocket.OPEN);
    const members = open.map((ws) => ws.deserializeAttachment() as Member);
    const students = members.filter((m) => m.role === 'student');
    // One entry per person, though a student may have two tabs open.
    const names = [...new Map(students.map((m) => [m.userId, m.name])).values()].sort((a, b) => a.localeCompare(b));
    const presence: LivePresence = {
      t: 'presence',
      students: names.length,
      staff: new Set(members.filter((m) => m.role !== 'student').map((m) => m.userId)).size,
      names,
    };
    const message = JSON.stringify(presence);
    for (const ws of this.ctx.getWebSockets('host')) if (ws !== leaving) ws.send(message);
    for (const ws of this.ctx.getWebSockets('assistant')) if (ws !== leaving) ws.send(message);
  }
}

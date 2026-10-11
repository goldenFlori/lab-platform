import { type Context, Hono } from 'hono';
import type { LiveRole, LiveState } from '../../shared/live';
import type { TenantEnv } from '../auth/access';
import { MEMBER_HEADER } from '../live/session';
import { forbidden } from './course-context';
import { type LabContext, labContext, visibleLab } from './lab-context';

// Live Lab sessions (#65), under …/labs/:labId/live. Staff with live.host start and end a lab's
// session; everyone who may see the lab joins it over a WebSocket, which the Worker checks and
// hands to the session's Durable Object with the member's role.

const mayHost = (c: Context<TenantEnv>, ctx: LabContext) => c.var.access.can('live.host', { courseId: ctx.course.id });

function roleIn(c: Context<TenantEnv>, ctx: LabContext, hostId: string): LiveRole {
  if (c.var.user?.id === hostId) return 'host';
  return ctx.staff ? 'assistant' : 'student';
}

const sessionStub = (c: Context<TenantEnv>, id: string) => c.env.LIVE.get(c.env.LIVE.idFromName(id));

export const liveRoutes = new Hono<TenantEnv>()
  .get('/', async (c) => {
    const ctx = await labContext(c);
    const lab = visibleLab(c, ctx);
    const running = await c.var.tenant.live.running(lab.id);
    return c.json({
      session: running
        ? {
            id: running.id,
            startedAt: running.startedAt.toISOString(),
            hostName: running.hostName,
            role: roleIn(c, ctx, running.hostId),
          }
        : null,
      canHost: mayHost(c, ctx),
    } satisfies LiveState);
  })

  .post('/', async (c) => {
    const ctx = await labContext(c);
    const lab = visibleLab(c, ctx);
    if (!mayHost(c, ctx)) return forbidden(c);
    await c.var.tenant.live.start(lab.id, c.var.user?.id as string);
    return c.json({ ok: true }, 201);
  })

  .post('/:sessionId/end', async (c) => {
    const ctx = await labContext(c);
    const lab = visibleLab(c, ctx);
    const running = await c.var.tenant.live.running(lab.id);
    if (!running || running.id !== c.req.param('sessionId')) return c.json({ error: 'not_found' }, 404);
    if (!mayHost(c, ctx)) return forbidden(c);
    await c.var.tenant.live.end(running.id);
    await sessionStub(c, running.id).fetch('https://live/end', { method: 'POST' });
    return c.body(null, 204);
  })

  // Joining: a WebSocket from our own pages, for the running session of a lab the user may see.
  .get('/:sessionId/ws', async (c) => {
    if (c.req.header('Origin') !== new URL(c.req.url).origin) return forbidden(c);
    if (c.req.header('Upgrade') !== 'websocket') return c.json({ error: 'invalid_request' }, 426);
    const ctx = await labContext(c);
    const lab = visibleLab(c, ctx);
    const running = await c.var.tenant.live.running(lab.id);
    if (!running || running.id !== c.req.param('sessionId')) return c.json({ error: 'not_found' }, 404);
    const user = c.var.user;
    if (!user) return forbidden(c);
    const member = { userId: user.id, name: user.fullName, role: roleIn(c, ctx, running.hostId) };
    const headers = new Headers({ Upgrade: 'websocket', [MEMBER_HEADER]: JSON.stringify(member) });
    return sessionStub(c, running.id).fetch('https://live/ws', { headers });
  });

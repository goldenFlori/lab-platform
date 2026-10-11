import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { LivePresence, LiveState } from '../../src/shared/live';
import { seedOrganization } from './fixtures';
import { account, ORIGIN, signIn } from './http';

// #65 is done when a pedagog starts a session, 30 simulated students join and leave, and the host
// sees the live count.

const at = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

async function setup() {
  const seed = await seedOrganization('fshn');
  const pedagog = await account(seed, 'pedagog', { courseId: seed.course.id });
  const ana = await account(seed, 'student', { groupId: seed.group.id });
  const labPath = `/orgs/${seed.org.slug}/courses/${seed.course.id}/labs/${seed.lab.id}`;
  await pedagog.call(`${labPath}/access`, {
    method: 'PUT',
    body: { groupId: seed.group.id, visibleFrom: at(-60), visibleUntil: null, solutionsFrom: null },
  });
  const state = async (who: typeof ana) => (await (await who.call(`${labPath}/live`)).json()) as LiveState;
  return { seed, pedagog, ana, labPath, state };
}

/** Opens a socket as the signed-in user; resolves once it is accepted. */
async function connect(cookie: string, path: string, origin = ORIGIN) {
  const res = await exports.default.fetch(`${ORIGIN}/api${path}`, {
    headers: { Upgrade: 'websocket', Cookie: cookie, Origin: origin },
  });
  const ws = res.webSocket;
  if (!ws) return { status: res.status, ws: null, messages: [] as LivePresence[] };
  const messages: LivePresence[] = [];
  ws.addEventListener('message', (event) => messages.push(JSON.parse(String(event.data)) as LivePresence));
  ws.accept();
  return { status: res.status, ws, messages };
}

const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
};

describe('Live Lab sessions', () => {
  it('are started and ended by staff who may host, and shown to students of the lab', async () => {
    const { pedagog, ana, labPath, state } = await setup();
    expect((await ana.call(`${labPath}/live`, { method: 'POST' })).status).toBe(403);
    expect((await pedagog.call(`${labPath}/live`, { method: 'POST' })).status).toBe(201);
    // Starting again gives the same session.
    await pedagog.call(`${labPath}/live`, { method: 'POST' });
    const hosted = await state(pedagog);
    expect(hosted).toMatchObject({ canHost: true, session: { role: 'host' } });
    expect(await state(ana)).toMatchObject({ canHost: false, session: { id: hosted.session?.id, role: 'student' } });

    const id = hosted.session?.id;
    expect((await ana.call(`${labPath}/live/${id}/end`, { method: 'POST' })).status).toBe(403);
    expect((await pedagog.call(`${labPath}/live/${id}/end`, { method: 'POST' })).status).toBe(204);
    expect((await state(ana)).session).toBeNull();
  });

  it('show the host 30 students joining and leaving', async () => {
    const { seed, pedagog, labPath, state } = await setup();
    await pedagog.call(`${labPath}/live`, { method: 'POST' });
    const id = (await state(pedagog)).session?.id;
    const ws = `${labPath}/live/${id}/ws`;
    const host = await connect(await signIn(pedagog.user.username), ws);
    expect(host.status).toBe(101);

    const students = await Promise.all(
      Array.from({ length: 30 }, async () => {
        const student = await account(seed, 'student', { groupId: seed.group.id });
        return connect(await signIn(student.user.username), ws);
      }),
    );
    expect(students.every((s) => s.status === 101)).toBe(true);
    await waitFor(() => host.messages.at(-1)?.students === 30);
    expect(host.messages.at(-1)?.names).toHaveLength(30);
    // Students are told nothing about the others.
    expect(students.every((s) => s.messages.length === 0)).toBe(true);

    for (const s of students.slice(0, 20)) s.ws?.close(1000);
    await waitFor(() => host.messages.at(-1)?.students === 10);

    // Ending closes everyone's socket.
    const closed = new Promise((resolve) => host.ws?.addEventListener('close', (e) => resolve(e.code)));
    await pedagog.call(`${labPath}/live/${id}/end`, { method: 'POST' });
    expect(await closed).toBe(4000);
  });

  it('let in only users who may see the lab, from our own pages', async () => {
    const { seed, pedagog, ana, labPath, state } = await setup();
    await pedagog.call(`${labPath}/live`, { method: 'POST' });
    const ws = `${labPath}/live/${(await state(pedagog)).session?.id}/ws`;
    const outsider = await account(seed);
    expect((await connect(await signIn(outsider.user.username), ws)).status).toBe(404);
    expect((await connect(await signIn(ana.user.username), ws, 'https://evil.test')).status).toBe(403);
    expect((await connect(await signIn(ana.user.username), `${labPath}/live/${crypto.randomUUID()}/ws`)).status).toBe(
      404,
    );
  });
});

import { runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { LiveMessage, LiveState } from '../../src/shared/live';
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
  if (!ws) return { status: res.status, ws: null, messages: [] as LiveMessage[] };
  const messages: LiveMessage[] = [];
  ws.addEventListener('message', (event) => messages.push(JSON.parse(String(event.data)) as LiveMessage));
  ws.accept();
  return { status: res.status, ws, messages };
}

/** The latest presence a socket was told. */
const last = (socket: { messages: LiveMessage[] }) =>
  socket.messages.filter((m) => m.t === 'presence').at(-1) as Extract<LiveMessage, { t: 'presence' }> | undefined;

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
    await waitFor(() => last(host)?.students === 30);
    expect(last(host)?.names).toHaveLength(30);
    // Students are told nothing about the others.
    expect(students.every((s) => s.messages.length === 0)).toBe(true);

    for (const s of students.slice(0, 20)) s.ws?.close(1000);
    await waitFor(() => last(host)?.students === 10);

    // Ending closes everyone's socket.
    const closed = new Promise((resolve) => host.ws?.addEventListener('close', (e) => resolve(e.code)));
    await pedagog.call(`${labPath}/live/${id}/end`, { method: 'POST' });
    expect(await closed).toBe(4000);
    // 30 sign-ins, each hashing a password: under a second here, but a busy CI runner passed 5 s (#106).
  }, 30_000);

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

  it("pass the host's step to everyone, and to each newcomer; a student cannot move the room", async () => {
    const { pedagog, ana, labPath, state, seed } = await setup();
    await pedagog.call(`${labPath}/live`, { method: 'POST' });
    const ws = `${labPath}/live/${(await state(pedagog)).session?.id}/ws`;
    const host = await connect(await signIn(pedagog.user.username), ws);
    const student = await connect(await signIn(ana.user.username), ws);
    host.ws?.send(JSON.stringify({ t: 'step', notebook: seed.notebook.id, at: 7 }));
    const step = { t: 'step', notebook: seed.notebook.id, at: 7 };
    await waitFor(() => student.messages.some((m) => m.t === 'step'));
    expect(student.messages.filter((m) => m.t === 'step')).toEqual([step]);

    student.ws?.send(JSON.stringify({ t: 'step', notebook: seed.notebook.id, at: 99 }));
    const late = await account(seed, 'student', { groupId: seed.group.id });
    const newcomer = await connect(await signIn(late.user.username), ws);
    await waitFor(() => newcomer.messages.some((m) => m.t === 'step'));
    expect(newcomer.messages.filter((m) => m.t === 'step')).toEqual([step]);
    expect(host.messages.some((m) => m.t === 'step')).toBe(false);
  });

  it('run a challenge: students send results, the staff see the board, names only to staff', async () => {
    const { seed, pedagog, ana, labPath, state } = await setup();
    await pedagog.call(`${labPath}/live`, { method: 'POST' });
    const ws = `${labPath}/live/${(await state(pedagog)).session?.id}/ws`;
    const host = await connect(await signIn(pedagog.user.username), ws);
    const a = await connect(await signIn(ana.user.username), ws);
    const besa = await account(seed, 'student', { groupId: seed.group.id });
    const b = await connect(await signIn(besa.user.username), ws);
    const cima = await account(seed, 'student', { groupId: seed.group.id });
    const c = await connect(await signIn(cima.user.username), ws);
    const board = () => host.messages.filter((m) => m.t === 'board').at(-1);

    // A student cannot start one.
    a.ws?.send(JSON.stringify({ t: 'challenge', notebook: seed.notebook.id, cell: 4, title: 'X' }));
    host.ws?.send(JSON.stringify({ t: 'challenge', notebook: seed.notebook.id, cell: 4, title: 'Ushtrimi 1' }));
    await waitFor(() => b.messages.some((m) => m.t === 'challenge'));
    expect(b.messages.filter((m) => m.t === 'challenge')).toEqual([
      { t: 'challenge', notebook: seed.notebook.id, cell: 4, title: 'Ushtrimi 1' },
    ]);
    await waitFor(() => board()?.waiting === 3);

    a.ws?.send(JSON.stringify({ t: 'result', cell: 4, status: 'pass', error: null, ms: 120 }));
    b.ws?.send(JSON.stringify({ t: 'result', cell: 4, status: 'error', error: 'NameError', ms: 80 }));
    c.ws?.send(JSON.stringify({ t: 'result', cell: 9, status: 'pass', error: null, ms: 80 }));
    await waitFor(() => board()?.passed === 1 && board()?.failed === 1);
    expect(board()).toMatchObject({
      waiting: 1,
      topError: { type: 'NameError', count: 1 },
      names: { passed: [ana.user.fullName], failed: [besa.user.fullName] },
    });
    // Students never see the board.
    expect(a.messages.some((m) => m.t === 'board')).toBe(false);

    host.ws?.send(JSON.stringify({ t: 'challenge-stop' }));
    await waitFor(() => a.messages.some((m) => m.t === 'challenge-stop'));
  });

  it('keep nothing of the class once it ends (#118)', async () => {
    const { seed, pedagog, ana, labPath, state } = await setup();
    await pedagog.call(`${labPath}/live`, { method: 'POST' });
    const id = (await state(pedagog)).session?.id ?? '';
    const ws = `${labPath}/live/${id}/ws`;
    const host = await connect(await signIn(pedagog.user.username), ws);
    const a = await connect(await signIn(ana.user.username), ws);
    host.ws?.send(JSON.stringify({ t: 'challenge', notebook: seed.notebook.id, cell: 4, title: 'Ushtrimi 1' }));
    await waitFor(() => a.messages.some((m) => m.t === 'challenge'));
    a.ws?.send(JSON.stringify({ t: 'result', cell: 4, status: 'pass', error: null, ms: 120 }));
    await waitFor(() => host.messages.some((m) => m.t === 'board' && m.passed === 1));

    const stored = () =>
      runInDurableObject(env.LIVE.get(env.LIVE.idFromName(id)), async (_, ctx) => (await ctx.storage.list()).size);
    expect(await stored()).toBeGreaterThan(0);
    await pedagog.call(`${labPath}/live/${id}/end`, { method: 'POST' });
    expect(await stored()).toBe(0);
  });

  it('queue help requests for the staff, and pass reactions on, throttled', async () => {
    const { pedagog, ana, labPath, state } = await setup();
    await pedagog.call(`${labPath}/live`, { method: 'POST' });
    const ws = `${labPath}/live/${(await state(pedagog)).session?.id}/ws`;
    const host = await connect(await signIn(pedagog.user.username), ws);
    const a = await connect(await signIn(ana.user.username), ws);
    const queue = () => host.messages.filter((m) => m.t === 'help-queue').at(-1);
    const mine = () => a.messages.filter((m) => m.t === 'help-state').at(-1);

    a.ws?.send(JSON.stringify({ t: 'help', where: 'Ushtrimi 2' }));
    await waitFor(() => queue()?.t === 'help-queue' && (queue() as { items: unknown[] }).items.length === 1);
    expect(queue()).toMatchObject({
      items: [{ id: ana.user.id, name: ana.user.fullName, where: 'Ushtrimi 2', takenBy: null }],
    });
    expect(mine()).toEqual({ t: 'help-state', status: 'waiting', by: null });

    // A student cannot take requests; staff take and close them.
    a.ws?.send(JSON.stringify({ t: 'help-take', id: ana.user.id }));
    host.ws?.send(JSON.stringify({ t: 'help-take', id: ana.user.id }));
    await waitFor(() => mine()?.t === 'help-state' && (mine() as { status: string }).status === 'taken');
    expect(mine()).toEqual({ t: 'help-state', status: 'taken', by: pedagog.user.fullName });
    host.ws?.send(JSON.stringify({ t: 'help-done', id: ana.user.id }));
    await waitFor(() => (mine() as { status: string | null }).status === null);
    expect(queue()).toMatchObject({ items: [] });

    a.ws?.send(JSON.stringify({ t: 'react', emoji: '👍' }));
    a.ws?.send(JSON.stringify({ t: 'react', emoji: '🎉' }));
    a.ws?.send(JSON.stringify({ t: 'react', emoji: '💣' }));
    await waitFor(() => host.messages.some((m) => m.t === 'react'));
    await new Promise((r) => setTimeout(r, 100));
    expect(host.messages.filter((m) => m.t === 'react')).toEqual([{ t: 'react', emoji: '👍' }]);
  });

  it('run a quick question: each student answers once, staff see the counts, the answer only on reveal', async () => {
    const { seed, pedagog, ana, labPath, state } = await setup();
    await pedagog.call(`${labPath}/live`, { method: 'POST' });
    const ws = `${labPath}/live/${(await state(pedagog)).session?.id}/ws`;
    const host = await connect(await signIn(pedagog.user.username), ws);
    const a = await connect(await signIn(ana.user.username), ws);
    const besa = await account(seed, 'student', { groupId: seed.group.id });
    const b = await connect(await signIn(besa.user.username), ws);
    const cima = await account(seed, 'student', { groupId: seed.group.id });
    const c = await connect(await signIn(cima.user.username), ws);
    const tally = () => host.messages.filter((m) => m.t === 'quiz-tally').at(-1);
    const question = {
      t: 'quiz',
      question: 'Cila strukturë përdor BFS?',
      options: ['Radha', 'Stiva', 'Pema'],
      correct: 0,
    };

    // A student cannot ask one.
    a.ws?.send(JSON.stringify(question));
    host.ws?.send(JSON.stringify(question));
    await waitFor(() => b.messages.some((m) => m.t === 'quiz'));
    const asked = b.messages.find((m) => m.t === 'quiz');
    expect(asked).toMatchObject({ question: question.question, options: question.options, correct: null });
    expect(host.messages.find((m) => m.t === 'quiz')).toMatchObject({ correct: 0 });
    const id = (asked as { id: string }).id;
    await waitFor(() => tally()?.t === 'quiz-tally');

    a.ws?.send(JSON.stringify({ t: 'answer', id, choice: 0 }));
    a.ws?.send(JSON.stringify({ t: 'answer', id, choice: 1 }));
    b.ws?.send(JSON.stringify({ t: 'answer', id, choice: 1 }));
    c.ws?.send(JSON.stringify({ t: 'answer', id, choice: 0 }));
    await waitFor(() => (tally() as { waiting: number }).waiting === 0);
    expect(tally()).toMatchObject({
      counts: [2, 1, 0],
      names: [[ana.user.fullName, cima.user.fullName].sort((x, y) => x.localeCompare(y)), [besa.user.fullName], []],
    });
    expect(a.messages.filter((m) => m.t === 'quiz-mine')).toEqual([{ t: 'quiz-mine', id, choice: 0 }]);
    // Students never see the tally, nor the answer before the reveal.
    expect(a.messages.some((m) => m.t === 'quiz-tally' || m.t === 'quiz-reveal')).toBe(false);

    host.ws?.send(JSON.stringify({ t: 'quiz-reveal' }));
    await waitFor(() => b.messages.some((m) => m.t === 'quiz-reveal'));
    expect(b.messages.find((m) => m.t === 'quiz-reveal')).toEqual({
      t: 'quiz-reveal',
      id,
      correct: 0,
      counts: [2, 1, 0],
    });
    // A newcomer gets the question and the revealed answer.
    const late = await account(seed, 'student', { groupId: seed.group.id });
    const d = await connect(await signIn(late.user.username), ws);
    await waitFor(() => d.messages.some((m) => m.t === 'quiz-reveal'));
    expect(d.messages.find((m) => m.t === 'quiz')).toMatchObject({ id, correct: 0 });
  });
});

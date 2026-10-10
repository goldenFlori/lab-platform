import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import worker from '../../src/api';
import { LOGIN_WINDOW_SECONDS, MAX_FAILURES_PER_IP, MAX_FAILURES_PER_USERNAME } from '../../src/api/auth/limits';
import { hashPassword, PASSWORD_ITERATIONS } from '../../src/shared/password';
import { seedOrganization } from './fixtures';

const ORIGIN = 'https://lab.test';
const PASSWORD = 'Sakte-sakte-2026';

async function seedAccount(options: { iterations?: number } = {}) {
  const seed = await seedOrganization('fshn');
  const user = await seed.tenant.users.create(
    {
      username: 'arben.hoxha',
      fullName: 'Arben Hoxha',
      passwordHash: await hashPassword(PASSWORD, options.iterations),
    },
    'student',
  );
  return { ...seed, student: user };
}

function login(username: string, password: string, ip = '203.0.113.7') {
  return exports.default.fetch(`${ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ username, password }),
  });
}

function sessionCookie(res: Response) {
  const cookie = res.headers.get('Set-Cookie') ?? '';
  return cookie.match(/__Host-session=([^;]*)/)?.[1];
}

function withSession(token: string | undefined, init: RequestInit = {}) {
  return { ...init, headers: { ...init.headers, Origin: ORIGIN, Cookie: `__Host-session=${token}` } };
}

const sql = (query: string, ...params: unknown[]) =>
  env.DB.prepare(query)
    .bind(...params)
    .all();

describe('sign-in', () => {
  it('signs in with username and password, and sets a safe session cookie', async () => {
    await seedAccount();
    const res = await login('Arben.Hoxha', PASSWORD);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      user: { username: 'arben.hoxha', fullName: 'Arben Hoxha' },
      organizations: [{ slug: expect.stringContaining('fshn') }],
    });

    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toMatch(/^__Host-session=[A-Za-z0-9_-]{43}; /);
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', `Max-Age=${30 * 24 * 60 * 60}`]) {
      expect(cookie).toContain(flag);
    }
  });

  it('stores only a hash of the session token', async () => {
    await seedAccount();
    const token = sessionCookie(await login('arben.hoxha', PASSWORD)) as string;
    const { results } = await sql('select id from sessions');
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toMatch(/^[0-9a-f]{64}$/);
    expect(results[0]?.id).not.toContain(token);
  });

  it('gives the same answer for an unknown user, a wrong password and a disabled account', async () => {
    const { student } = await seedAccount();
    const unknown = await login('nobody', PASSWORD);
    const wrong = await login('arben.hoxha', 'wrong');
    await sql("update users set status = 'disabled' where id = ?", student.id);
    const disabled = await login('arben.hoxha', PASSWORD);
    for (const res of [unknown, wrong, disabled]) {
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'invalid_credentials' });
      expect(res.headers.get('Set-Cookie')).toBeNull();
    }
  });

  it('refuses malformed requests', async () => {
    const res = await exports.default.fetch(`${ORIGIN}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_request' });
  });

  it('upgrades a hash made with older parameters at the next sign-in', async () => {
    const { student } = await seedAccount({ iterations: 1000 });
    expect((await login('arben.hoxha', PASSWORD)).status).toBe(200);
    const { results } = await sql('select password_hash from users where id = ?', student.id);
    expect(results[0]?.password_hash).toMatch(new RegExp(`^pbkdf2-sha256\\$${PASSWORD_ITERATIONS}\\$`));
    expect((await login('arben.hoxha', PASSWORD)).status).toBe(200);
  });
});

describe('sessions', () => {
  it('knows the signed-in user, and nobody without a session', async () => {
    await seedAccount();
    const token = sessionCookie(await login('arben.hoxha', PASSWORD));
    const me = await exports.default.fetch(`${ORIGIN}/api/me`, withSession(token));
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { username: 'arben.hoxha' } });

    expect((await exports.default.fetch(`${ORIGIN}/api/me`)).status).toBe(401);
    expect((await exports.default.fetch(`${ORIGIN}/api/me`, withSession('forged'))).status).toBe(401);
  });

  it('ends the session at logout', async () => {
    await seedAccount();
    const token = sessionCookie(await login('arben.hoxha', PASSWORD));
    const logout = await exports.default.fetch(`${ORIGIN}/api/auth/logout`, withSession(token, { method: 'POST' }));
    expect(logout.status).toBe(204);
    expect(logout.headers.get('Set-Cookie')).toMatch(/__Host-session=; Max-Age=0/);
    expect((await sql('select id from sessions')).results).toHaveLength(0);
    expect((await exports.default.fetch(`${ORIGIN}/api/me`, withSession(token))).status).toBe(401);
  });

  it('renews a session that is still in use once half of it has passed', async () => {
    await seedAccount();
    const token = sessionCookie(await login('arben.hoxha', PASSWORD));
    const inTenDays = Math.floor(Date.now() / 1000) + 10 * 24 * 60 * 60;
    await sql('update sessions set expires_at = ?', inTenDays);

    const me = await exports.default.fetch(`${ORIGIN}/api/me`, withSession(token));
    expect(me.status).toBe(200);
    expect(sessionCookie(me)).toBe(token);
    const { results } = await sql('select expires_at from sessions');
    expect(Number(results[0]?.expires_at)).toBeGreaterThan(inTenDays + 19 * 24 * 60 * 60);
  });

  it('does not write to the database on every request of a fresh session', async () => {
    await seedAccount();
    const token = sessionCookie(await login('arben.hoxha', PASSWORD));
    const me = await exports.default.fetch(`${ORIGIN}/api/me`, withSession(token));
    expect(me.headers.get('Set-Cookie')).toBeNull();
  });

  it('drops an expired session', async () => {
    await seedAccount();
    const token = sessionCookie(await login('arben.hoxha', PASSWORD));
    await sql('update sessions set expires_at = ?', Math.floor(Date.now() / 1000) - 1);
    const me = await exports.default.fetch(`${ORIGIN}/api/me`, withSession(token));
    expect(me.status).toBe(401);
    expect(me.headers.get('Set-Cookie')).toMatch(/__Host-session=; Max-Age=0/);
    expect((await sql('select id from sessions')).results).toHaveLength(0);
  });

  it('ends the sessions of a disabled account', async () => {
    const { student } = await seedAccount();
    const token = sessionCookie(await login('arben.hoxha', PASSWORD));
    await sql("update users set status = 'disabled' where id = ?", student.id);
    expect((await exports.default.fetch(`${ORIGIN}/api/me`, withSession(token))).status).toBe(401);
  });
});

describe('brute-force protection', () => {
  it(`locks a username after ${MAX_FAILURES_PER_USERNAME} wrong passwords, even for the right one`, async () => {
    await seedAccount();
    for (let i = 0; i < MAX_FAILURES_PER_USERNAME; i++) {
      expect((await login('arben.hoxha', `guess-${i}`, `198.51.100.${i}`)).status).toBe(401);
    }
    const locked = await login('arben.hoxha', PASSWORD, '198.51.100.200');
    expect(locked.status).toBe(429);
    expect(await locked.json()).toEqual({ error: 'too_many_attempts' });
    const retryAfter = Number(locked.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(LOGIN_WINDOW_SECONDS);
  });

  it('lets the user in again once the window has passed', async () => {
    await seedAccount();
    for (let i = 0; i < MAX_FAILURES_PER_USERNAME; i++) await login('arben.hoxha', `guess-${i}`);
    expect((await login('arben.hoxha', PASSWORD)).status).toBe(429);

    await sql('update login_attempts set window_start = window_start - ?', LOGIN_WINDOW_SECONDS);
    expect((await login('arben.hoxha', PASSWORD)).status).toBe(200);
  });

  it('forgets earlier mistakes after a successful sign-in', async () => {
    await seedAccount();
    for (let i = 0; i < MAX_FAILURES_PER_USERNAME - 1; i++) await login('arben.hoxha', `guess-${i}`);
    expect((await login('arben.hoxha', PASSWORD)).status).toBe(200);
    for (let i = 0; i < MAX_FAILURES_PER_USERNAME - 1; i++) await login('arben.hoxha', `again-${i}`);
    expect((await login('arben.hoxha', PASSWORD)).status).toBe(200);
  });

  it(`blocks an address after ${MAX_FAILURES_PER_IP} failures across usernames`, async () => {
    await seedAccount();
    for (let i = 0; i < MAX_FAILURES_PER_IP; i++) await login(`someone-${i}`, 'guess', '192.0.2.66');
    expect((await login('arben.hoxha', PASSWORD, '192.0.2.66')).status).toBe(429);
    expect((await login('arben.hoxha', PASSWORD, '192.0.2.67')).status).toBe(200);
  });
});

describe('requests from other sites', () => {
  it('refuses changes without our Origin, and allows reads', async () => {
    await seedAccount();
    for (const headers of [{}, { Origin: 'https://evil.example' }] as Record<string, string>[]) {
      const res = await exports.default.fetch(`${ORIGIN}/api/auth/login`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'arben.hoxha', password: PASSWORD }),
      });
      expect(res.status).toBe(403);
    }
    expect((await exports.default.fetch(`${ORIGIN}/api/health`)).status).toBe(200);
  });
});

describe('daily clean-up', () => {
  it('removes expired sessions and finished attempt windows, and keeps the rest', async () => {
    await seedAccount();
    await login('arben.hoxha', PASSWORD);
    await login('arben.hoxha', PASSWORD);
    await login('arben.hoxha', 'wrong');
    const now = Math.floor(Date.now() / 1000);
    await sql('update sessions set expires_at = ? where rowid = (select min(rowid) from sessions)', now - 1);
    await sql(
      "insert into login_attempts (key, window_start, count) values ('user:old', ?, 3)",
      now - LOGIN_WINDOW_SECONDS - 1,
    );

    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController(), env, ctx);
    await waitOnExecutionContext(ctx);

    expect((await sql('select id from sessions')).results).toHaveLength(1);
    expect((await sql('select key from login_attempts order by key')).results.map((r) => r.key)).toEqual([
      'ip:203.0.113.7',
      'user:arben.hoxha',
    ]);
  });
});

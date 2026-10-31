import { describe, expect, it } from 'vitest';
import type { Branding } from '../../src/shared/branding';
import { seedOrganization } from './fixtures';
import { account, caller } from './http';

// #201: an institution's admins set its name, a readable accent and a logo; its members see them, and
// so does the sign-in page reached from one of its join codes. Others see nothing of it.

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

async function setup() {
  const seed = await seedOrganization('fshn');
  const admin = await account(seed, 'admin');
  const pedagog = await account(seed, 'pedagog', { courseId: seed.course.id });
  const student = await account(seed, 'student', { groupId: seed.group.id });
  const branding = async (who: typeof admin) => (await (await who.call('/orgs/fshn/branding')).json()) as Branding;
  const logo = (who: typeof admin, body: BodyInit, type: string) =>
    who.call('/orgs/fshn/logo', { method: 'PUT', raw: body, headers: { 'Content-Type': type } });
  return { seed, admin, pedagog, student, branding, logo };
}

describe('institution branding', () => {
  it('is set by the admins, with a readable accent, and read by every member', async () => {
    const { admin, pedagog, student, branding } = await setup();
    expect(await branding(student)).toEqual({ name: expect.any(String), accent: null, logo: null });
    const set = (who: typeof admin, body: unknown) => who.call('/orgs/fshn/branding', { method: 'PUT', body });
    expect((await set(admin, { name: 'Fakulteti i Shkencave', accent: '#7a1f3d' })).status).toBe(200);
    expect(await branding(student)).toMatchObject({ name: 'Fakulteti i Shkencave', accent: '#7a1f3d' });
    // Yellow carries white text at 1.6:1, and a pedagog does not run the institution.
    expect((await set(admin, { name: 'FSHN', accent: '#ffcc00' })).status).toBe(400);
    expect((await set(admin, { name: 'FSHN', accent: 'red' })).status).toBe(400);
    expect((await set(pedagog, { name: 'FSHN', accent: null })).status).toBe(403);
  });

  it('takes a logo of an allowed type and size, served so that it cannot run code', async () => {
    const { admin, pedagog, student, branding, logo } = await setup();
    expect((await logo(admin, PNG, 'image/png')).status).toBe(204);
    const url = (await branding(student)).logo as string;
    expect(url).toMatch(/^\/api\/orgs\/fshn\/logo\?v=\d+$/);
    const res = await student.call(url.replace('/api', ''));
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toContain('sandbox');

    expect((await logo(admin, '<html></html>', 'text/html')).status).toBe(400);
    expect((await logo(admin, new Uint8Array(100_001), 'image/png')).status).toBe(413);
    expect((await logo(pedagog, PNG, 'image/png')).status).toBe(403);
    expect((await admin.call('/orgs/fshn/logo', { method: 'DELETE' })).status).toBe(204);
    expect((await branding(student)).logo).toBeNull();
    expect((await student.call('/orgs/fshn/logo')).status).toBe(404);
  });

  it('shows on the sign-in page of a join code, to anyone with the code, and to no one else', async () => {
    const { seed, admin, pedagog, logo } = await setup();
    await admin.call('/orgs/fshn/branding', { method: 'PUT', body: { name: 'FSHN', accent: '#7a1f3d' } });
    await logo(admin, PNG, 'image/png');
    const group = (await (
      await pedagog.call(`/orgs/fshn/courses/${seed.course.id}/groups`, { method: 'POST', body: { name: 'Grupi B' } })
    ).json()) as { joinCode: string };
    const visitor = caller();
    const view = (await (await visitor(`/join/${group.joinCode}/branding`)).json()) as Branding;
    expect(view).toEqual({ name: 'FSHN', accent: '#7a1f3d', logo: expect.stringMatching(/^\/api\/join\//) });
    expect((await visitor((view.logo as string).replace('/api', ''))).status).toBe(200);
    expect((await visitor('/join/ZZZZZZZZ/branding')).status).toBe(404);
  });

  it('belongs to its institution only', async () => {
    const { admin } = await setup();
    const other = await seedOrganization('upt');
    const outsider = await account(other, 'admin');
    expect((await outsider.call('/orgs/fshn/branding')).status).toBe(404);
    expect(
      (await outsider.call('/orgs/fshn/branding', { method: 'PUT', body: { name: 'X', accent: null } })).status,
    ).toBe(404);
    // Its own is untouched by the other's change.
    await admin.call('/orgs/fshn/branding', { method: 'PUT', body: { name: 'FSHN', accent: '#7a1f3d' } });
    expect(((await (await outsider.call('/orgs/upt/branding')).json()) as Branding).accent).toBeNull();
  });
});

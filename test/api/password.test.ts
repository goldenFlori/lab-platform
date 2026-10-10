import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, PASSWORD_ITERATIONS, verifyPassword } from '../../src/shared/password';

describe('passwords', () => {
  it('stores the algorithm and its parameters with the hash', async () => {
    expect(await hashPassword('sekret')).toMatch(
      new RegExp(`^pbkdf2-sha256\\$${PASSWORD_ITERATIONS}\\$[A-Za-z0-9+/]{22}==\\$[A-Za-z0-9+/]{43}=$`),
    );
  });

  it('accepts the right password and refuses others', async () => {
    const stored = await hashPassword('Kodi-i-sakte-2026');
    expect(await verifyPassword('Kodi-i-sakte-2026', stored)).toBe(true);
    expect(await verifyPassword('kodi-i-sakte-2026', stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('uses a new salt every time', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('treats ë typed as one character or as e plus a combining mark as the same password', async () => {
    const stored = await hashPassword('Përshëndetje');
    expect(await verifyPassword('Pe\u0308rshe\u0308ndetje', stored)).toBe(true);
  });

  it('never accepts a missing or damaged hash', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
  });

  it('asks for a new hash when the parameters change', async () => {
    expect(needsRehash(await hashPassword('x'))).toBe(false);
    expect(needsRehash(await hashPassword('x', 1000))).toBe(true);
  });
});

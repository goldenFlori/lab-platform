import { describe, expect, it } from 'vitest';
import { type AccessRule, ruleForGroup, solutionsOpen, stateOf } from '../../src/shared/lab-visibility';

const now = new Date('2026-10-12T10:00:00Z');
const at = (iso: string) => new Date(iso);
const rule = (r: Partial<AccessRule> = {}): AccessRule => ({
  groupId: null,
  visibleFrom: null,
  visibleUntil: null,
  solutionsFrom: null,
  ...r,
});

describe('lab visibility', () => {
  it('is hidden without a rule, or with a rule that was never opened', () => {
    expect(stateOf(undefined, now)).toBe('hidden');
    expect(stateOf(rule(), now)).toBe('hidden');
  });

  it('is scheduled before visibleFrom, open in the window, closed after visibleUntil', () => {
    const window = rule({ visibleFrom: at('2026-10-12T12:00:00Z'), visibleUntil: at('2026-10-19T12:00:00Z') });
    expect(stateOf(window, now)).toBe('scheduled');
    expect(stateOf(window, at('2026-10-12T12:00:00Z'))).toBe('open');
    expect(stateOf(window, at('2026-10-19T11:59:59Z'))).toBe('open');
    expect(stateOf(window, at('2026-10-19T12:00:00Z'))).toBe('closed');
    expect(stateOf(rule({ visibleFrom: at('2026-01-01T00:00:00Z') }), now)).toBe('open');
  });

  it("follows a group's own rule before the course-wide one", () => {
    const course = rule({ visibleFrom: at('2026-01-01T00:00:00Z') });
    const hiddenForB = rule({ groupId: 'b' });
    expect(stateOf(ruleForGroup([course, hiddenForB], 'a'), now)).toBe('open');
    expect(stateOf(ruleForGroup([course, hiddenForB], 'b'), now)).toBe('hidden');
    expect(stateOf(ruleForGroup([rule({ groupId: 'b', visibleFrom: at('2026-01-01T00:00:00Z') })], 'b'), now)).toBe(
      'open',
    );
    expect(ruleForGroup([], 'a')).toBeUndefined();
  });

  it('opens solutions to students only while the lab is open and from solutionsFrom on', () => {
    const open = at('2026-01-01T00:00:00Z');
    expect(solutionsOpen(rule({ visibleFrom: open }), now)).toBe(false);
    expect(solutionsOpen(rule({ visibleFrom: open, solutionsFrom: at('2026-10-13T00:00:00Z') }), now)).toBe(false);
    expect(solutionsOpen(rule({ visibleFrom: open, solutionsFrom: at('2026-10-11T00:00:00Z') }), now)).toBe(true);
    expect(solutionsOpen(rule({ solutionsFrom: at('2026-10-11T00:00:00Z') }), now)).toBe(false);
  });
});

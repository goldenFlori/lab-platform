// When a lab is open to a group (#12). No imports: the API decides with this, and tests check it.
//
// A rule belongs to a lab and either one group or (groupId null) the whole course. A group's own
// rule wins over the course-wide one. No rule, or a rule without visibleFrom, means hidden:
// students see only what has been opened.

export type AccessRule = {
  groupId: string | null;
  visibleFrom: Date | null;
  visibleUntil: Date | null;
  /** Before this moment only staff see the solutions. */
  solutionsFrom: Date | null;
};

export type LabState = 'hidden' | 'scheduled' | 'open' | 'closed';

/** The rule that applies to a group: its own, or else the course-wide one. */
export function ruleForGroup(rules: readonly AccessRule[], groupId: string): AccessRule | undefined {
  return rules.find((rule) => rule.groupId === groupId) ?? rules.find((rule) => rule.groupId === null);
}

export function stateOf(rule: AccessRule | undefined, now: Date): LabState {
  if (!rule?.visibleFrom) return 'hidden';
  if (now < rule.visibleFrom) return 'scheduled';
  if (rule.visibleUntil && now >= rule.visibleUntil) return 'closed';
  return 'open';
}

/** Solutions open to students only while the lab itself is open, and from solutionsFrom on. */
export function solutionsOpen(rule: AccessRule | undefined, now: Date): boolean {
  return stateOf(rule, now) === 'open' && rule?.solutionsFrom != null && rule.solutionsFrom <= now;
}

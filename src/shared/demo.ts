// The demo institution (#216): anyone may try the platform in it, as a student or as a pedagog, through
// two shared accounts without passwords. It holds no real person's data and is rebuilt every night.
// It exists when an institution with this address does (only the platform's owner creates one).
// No imports: the app uses it without Zod.

export const DEMO_SLUG = 'demo';

export const DEMO_ROLES = ['student', 'pedagog'] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

/** The shared accounts visitors are signed in to. They have no password. */
export const DEMO_ACCOUNTS: Record<DemoRole, { username: string; fullName: string }> = {
  student: { username: 'demo.studenti', fullName: 'Studenti Demo' },
  pedagog: { username: 'demo.pedagog', fullName: 'Pedagogu Demo' },
};

export const isDemoAccount = (username: string) => DEMO_ROLES.some((role) => DEMO_ACCOUNTS[role].username === username);

/** What /api/demo answers: whether the demo can be tried now. */
export type DemoStatus = { enabled: boolean };

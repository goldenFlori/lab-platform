// The roles a course's staff may have (#64), apart from the schemas in staff.ts: the app imports values
// from here, and from there only types (#193).

export const STAFF_ROLES = ['pedagog', 'assistant'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// The roles an institution's admin gives across the whole institution (#202), apart from the schemas in
// org-admin.ts: the app imports values from here, and from there only types.

export const ORG_ROLES = ['admin', 'coordinator', 'pedagog'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];
export const isOrgRole = (value: unknown): value is OrgRole => (ORG_ROLES as readonly unknown[]).includes(value);

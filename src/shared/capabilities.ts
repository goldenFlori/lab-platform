// What the API checks. Roles are data (the roles table): named sets of these capabilities, so a new
// role needs no code. A new capability needs code, because something has to check it.
// No imports: the account script may use this file directly.

export const CAPABILITIES = [
  'org.manage',
  'staff.approve',
  'analytics.view',
  'course.create',
  'course.template.edit',
  'course.manage',
  'lab.view',
  'lab.publish',
  'solution.view',
  'student.manage',
  'submission.create',
  'submission.review',
  'grade.edit',
  'live.host',
  'ai.configure',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

/**
 * What a user may do in one organization, by scope. A capability in `organization` applies to every
 * course and group; one in `courses[id]` to that course and its groups; one in `groups[id]` to that
 * group. From GET /api/orgs/:org/access, so the app can hide what the API would refuse anyway.
 */
export type AccessSummary = {
  organization: { id: string; name: string; slug: string };
  capabilities: {
    organization: Capability[];
    courses: Record<string, Capability[]>;
    groups: Record<string, Capability[]>;
  };
};

// A kolokium's limits (#169), apart from the schemas in submissions.ts: the app imports values from
// here, and from there only types, which keeps Zod out of its bundle (#193).

/** A kolokium's length, in minutes, from each student's start. */
export const KOLOKIUM_MINUTES = { min: 5, max: 300 } as const;

/** When a student's kolokium ends: their start plus its minutes, or its due time if earlier. */
export const kolokiumEnd = (startedAt: number, minutes: number, dueAt: number) =>
  Math.min(startedAt + minutes * 60_000, dueAt);

/** For lookups in the visualizers' own static data that cannot fail; a clear error if one does. */
export function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`Missing ${what}`);
  return value;
}

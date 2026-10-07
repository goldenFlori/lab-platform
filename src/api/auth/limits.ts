// Limits on failed sign-ins, counted in fixed 15-minute windows.
// - Per username: a student who mistypes a few times is never stuck, while guessing a 12-character
//   random password at 10 tries per 15 minutes would take longer than the universe has existed.
// - Per IP: generous, because a whole class signs in from the university network at once.

export const LOGIN_WINDOW_SECONDS = 15 * 60;
export const MAX_FAILURES_PER_USERNAME = 10;
export const MAX_FAILURES_PER_IP = 100;

/** Windows that started at or before this moment have ended. */
export function windowCutoff(now: Date) {
  return new Date(now.getTime() - LOGIN_WINDOW_SECONDS * 1000);
}

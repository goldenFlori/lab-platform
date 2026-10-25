// How long the platform keeps what (#116). The daily job deletes what has passed its period, the
// session cookie uses its lifetime, and the privacy page prints these numbers, so the three cannot
// disagree. The data processing agreement quotes the same list. No imports: the i18n files use it.

export const RETENTION = {
  /** A sign-in ends after this many days without use. */
  sessionDays: 30,
  /** Students' "Explain my error" questions with the answers (#86): a semester and its exams. */
  aiQuestionDays: 180,
  /**
   * Daily learning activity, first-try results of predictions (#151), AI use counts and ended Live
   * Labs: two academic years of reports.
   */
  activityYears: 2,
  /** A deletion request once handled, so the institution can show it answered. */
  handledRequestYears: 1,
} as const;

export const daysOf = (years: number) => years * 365;

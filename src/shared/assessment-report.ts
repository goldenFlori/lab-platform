import { firstWrong, normalize, PLAIN_WORDS, traceIds, traceOf } from './trace';
import type { TraceProblem } from './trace-problem';

// The assessment report (#170): after a kolokium or any graded hand-in, per exercise and per trace
// table row, how many got it right and the most common wrong value, for the groups the user reviews.
// Counts only, from MIN_REPORT_STUDENTS up, never a name beside an answer.

/** Below this many students a part of the report stays empty: a count could point at a person. */
export const MIN_REPORT_STUDENTS = 5;

/** A wrong value is "common" from this many students up; one student's answer is never shown. */
export const MIN_COMMON_WRONG = 2;

export type ExerciseReport = {
  cell: number;
  title: string;
  pass: number;
  fail: number;
  error: number;
  /** Not written: the exercise stub was left as it was. */
  todo: number;
};

export type TraceRowReport = {
  /** Students whose table has this row: a variant's table can be shorter or longer than another's. */
  of: number;
  right: number;
  /** Rows left empty. */
  empty: number;
  /**
   * The most common first wrong cell: its column key (`d:B`, `edge`, `2,3` for a Floyd-Warshall cell)
   * and the canonical value typed. For a variant, every student has their own graph, so only the
   * column counts: `d` for any distance, `D` for any matrix cell, and no value.
   */
  wrong: { key: string; value: string | null; count: number } | null;
};

export type TraceReport = {
  cell: number;
  title: string | null;
  points: number;
  variant: boolean;
  /** Who handed in for this table. */
  students: number;
  rows: TraceRowReport[];
};

export type AssessmentReport = {
  /** The groups the user reviews, for the choice; `group` is null for all of them together. */
  groups: { id: string; name: string }[];
  group: string | null;
  students: number;
  handedIn: number;
  graded: number;
  /** Null below MIN_REPORT_STUDENTS graded. */
  exercises: ExerciseReport[] | null;
  /** Null below MIN_REPORT_STUDENTS handed in. */
  traces: TraceReport[] | null;
};

/** One trace table's rows across the students who handed it in. */
export function traceRows(
  answers: { problem: TraceProblem; rows: Record<string, string>[] }[],
  variant: boolean,
): TraceRowReport[] {
  const traced = answers.map((a) => ({ ...a, trace: traceOf(a.problem, PLAIN_WORDS), ids: traceIds(a.problem) }));
  const n = Math.max(0, ...traced.map((a) => a.trace.rows.length));
  const report = Array.from({ length: n }, () => ({ of: 0, right: 0, empty: 0, wrongs: new Map<string, number>() }));
  for (const { trace, ids, rows } of traced) {
    trace.rows.forEach((row, i) => {
      const at = report[i];
      if (!at) return;
      at.of++;
      const mine = rows[i] ?? {};
      if (!Object.values(mine).some((v) => v.trim())) {
        at.empty++;
        return;
      }
      const wrong = firstWrong(trace, row, mine, ids);
      if (!wrong) {
        at.right++;
        return;
      }
      const value = normalize(wrong.column.kind, mine[wrong.key] ?? '', ids) ?? '';
      const key = variant
        ? JSON.stringify([trace.matrix ? 'D' : wrong.key.startsWith('d:') ? 'd' : wrong.key, null])
        : JSON.stringify([wrong.key, value]);
      at.wrongs.set(key, (at.wrongs.get(key) ?? 0) + 1);
    });
  }
  return report.map(({ of, right, empty, wrongs }) => {
    // The most common, and on a tie the first seen.
    let top: [string, number] | null = null;
    for (const entry of wrongs) if (!top || entry[1] > top[1]) top = entry;
    if (!top || top[1] < MIN_COMMON_WRONG) return { of, right, empty, wrong: null };
    const [key, value] = JSON.parse(top[0]) as [string, string | null];
    return { of, right, empty, wrong: { key, value, count: top[1] } };
  });
}

import { firstWrong, PLAIN_WORDS, traceIds, traceOf } from './trace';
import { isTracePresetId, TRACE_PRESETS } from './trace-presets';
import { isTraceProblem, type TraceProblem, variantIssue, variantProblem, variantSeed } from './trace-problem';

// Grading a handed-in trace table on the server (#168): the problem the student had (the course's,
// the pedagog's, or their own variant), its expected table rebuilt from the same code the browser
// uses, and a score for the rows right. Nothing the browser says about right or wrong is trusted.

/** Points a trace table is worth, from its embed props; 0 for a practice table. */
export function tracePoints(props: Record<string, unknown> | null | undefined) {
  const p = props?.points;
  return typeof p === 'number' && Number.isInteger(p) && p > 0 && p <= 1000 ? p : 0;
}

/** Whether a trace table's points are acceptable (absent, or a whole number from 1 to 1000). */
export const tracePointsOk = (props: Record<string, unknown> | null | undefined) =>
  props?.points === undefined || tracePoints(props) > 0;

/** The problem a student had at this embed: their variant, the pedagog's own, or the course's. */
export function traceProblemFor(
  props: Record<string, unknown> | null | undefined,
  at: { userId: string; notebookId: string; cell: number },
): TraceProblem {
  if (variantIssue(props?.variant) === null) {
    return variantProblem(props?.variant as never, variantSeed(at.userId, at.notebookId, at.cell));
  }
  if (isTraceProblem(props?.problem)) return props.problem;
  return TRACE_PRESETS[isTracePresetId(props?.preset) ? props.preset : 'lab07-dijkstra'];
}

export type TraceScore = { cell: number; rows: number; right: number; points: number; score: number };

/** How many of the student's rows match the expected table, and the points they earn. */
export function scoreTrace(problem: TraceProblem, answers: Record<string, string>[], points: number) {
  const trace = traceOf(problem, PLAIN_WORDS);
  const ids = traceIds(problem);
  const right = trace.rows.filter((row, i) => {
    const mine = answers[i];
    return !!mine && firstWrong(trace, row, mine, ids) === null;
  }).length;
  const rows = trace.rows.length;
  return { rows, right, points, score: rows ? Math.round((points * right) / rows) : 0 };
}

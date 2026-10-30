import { useQuery } from '@tanstack/react-query';
import { ChartColumn } from 'lucide-react';
import { useState } from 'react';
import { type ExerciseReport, MIN_REPORT_STUDENTS, type TraceReport } from '../../../shared/assessment-report';
import type { Embed } from '../../../shared/notebooks';
import { display, type Trace, traceOf } from '../../../shared/trace';
import { traceProblemFor } from '../../../shared/trace-grading';
import { TRACE_TEXT, type TraceText } from '../../../viz/algorithms/trace.text';
import { useText } from '../../../viz/kit/text';
import { useT } from '../../i18n';
import { reportQuery } from '../../lib/grading';
import type { NotebookRef } from '../../lib/notebooks';
import { ScrollRegion } from '../ScrollRegion';

/**
 * The assessment report (#170) under a notebook's submissions: per exercise and per trace table row,
 * how many got it right and the most common mistake, for one group or all the user reviews. The
 * server sends counts only, and nothing below five students.
 */
export function AssessmentReport({
  notebookRef,
  group,
  embeds,
}: {
  notebookRef: NotebookRef;
  /** The group the page shows. */
  group: string;
  embeds: Embed[];
}) {
  const t = useT();
  const [all, setAll] = useState(false);
  const query = useQuery(reportQuery(notebookRef, all ? null : group));
  const report = query.data;
  const shownGroup = report?.groups.find((g) => g.id === group);

  return (
    <section
      aria-labelledby="assessment-report"
      data-testid="assessment-report"
      className="mt-6 rounded-3xl border border-border bg-surface p-5 shadow-surface sm:p-7"
    >
      <h2 id="assessment-report" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <ChartColumn className="size-5 text-accent" aria-hidden="true" /> {t.assessment.title}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{t.assessment.lead}</p>
      {report && report.groups.length > 1 && (
        <label className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{t.assessment.scope}</span>
          <select
            value={all ? '' : group}
            onChange={(e) => setAll(e.target.value === '')}
            className="h-9 rounded-xl border border-border bg-surface px-3"
          >
            <option value={group}>{shownGroup?.name}</option>
            <option value="">{t.assessment.allGroups}</option>
          </select>
        </label>
      )}
      {query.isError ? (
        <p className="mt-4 text-sm text-danger">{t.assessment.loadFailed}</p>
      ) : !report ? (
        <p className="mt-4 text-sm text-muted" aria-busy="true">
          {t.common.loading}
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm font-medium" data-testid="report-counts">
            {t.assessment.counts(report.handedIn, report.students, report.graded)}
          </p>
          {report.handedIn < MIN_REPORT_STUDENTS ? (
            <p className="mt-2 text-sm text-muted">{t.assessment.tooFew(MIN_REPORT_STUDENTS)}</p>
          ) : (
            <>
              {report.exercises ? (
                report.exercises.length > 0 && <Exercises rows={report.exercises} />
              ) : (
                <p className="mt-2 text-sm text-muted">{t.assessment.gradeFirst(MIN_REPORT_STUDENTS)}</p>
              )}
              {report.traces?.map((table, i) => (
                <TraceTable
                  key={table.cell}
                  n={i + 1}
                  table={table}
                  notebookRef={notebookRef}
                  embed={embeds.find((e) => e.cell === table.cell)}
                />
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}

const th = 'py-2 pr-4 font-medium';

function Exercises({ rows }: { rows: ExerciseReport[] }) {
  const t = useT();
  return (
    <div className="mt-5">
      <h3 className="text-base font-semibold">{t.assessment.exercises}</h3>
      <ScrollRegion label={t.assessment.exercises} className="mt-2">
        <table className="w-full min-w-md text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-separator">
              <th scope="col" className={th}>
                {t.assessment.exercise}
              </th>
              <th scope="col" className={th}>
                {t.assessment.pass}
              </th>
              <th scope="col" className={th}>
                {t.assessment.fail}
              </th>
              <th scope="col" className={th}>
                {t.assessment.error}
              </th>
              <th scope="col" className="py-2 font-medium">
                {t.assessment.todo}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const total = row.pass + row.fail + row.error + row.todo;
              return (
                <tr key={row.cell} className="border-b border-separator/60 last:border-0">
                  <th scope="row" className="py-2 pr-4 font-medium">
                    {row.title}
                  </th>
                  <td className="py-2 pr-4 tabular-nums">
                    <Share n={row.pass} of={total} />
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{row.fail}</td>
                  <td className="py-2 pr-4 tabular-nums">{row.error}</td>
                  <td className="py-2 tabular-nums">{row.todo}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollRegion>
    </div>
  );
}

/** "6/7" with a small bar. */
function Share({ n, of }: { n: number; of: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-secondary" aria-hidden="true">
        <span className="block h-full rounded-full bg-success" style={{ width: `${of ? (100 * n) / of : 0}%` }} />
      </span>
      {n}/{of}
    </span>
  );
}

function TraceTable({
  n,
  table,
  notebookRef,
  embed,
}: {
  n: number;
  table: TraceReport;
  notebookRef: NotebookRef;
  embed: Embed | undefined;
}) {
  const t = useT();
  const T = useText(TRACE_TEXT);
  // A problem the whole room shares names its rows and columns as the table does.
  const trace = table.variant
    ? null
    : traceOf(
        traceProblemFor(embed?.props, { userId: '', notebookId: notebookRef.notebookId, cell: table.cell }),
        T.words,
      );
  return (
    <div className="mt-6">
      <h3 className="text-base font-semibold">
        {table.title || t.assessment.table(n)}{' '}
        <span className="text-sm font-normal text-muted">· {t.assessment.points(table.points)}</span>
      </h3>
      {table.variant && <p className="text-xs text-muted">{t.assessment.variant}</p>}
      <ScrollRegion label={table.title || t.assessment.table(n)} className="mt-2">
        <table className="w-full min-w-md text-left text-sm">
          <caption className="sr-only">{table.title || t.assessment.table(n)}</caption>
          <thead className="text-xs text-muted">
            <tr className="border-b border-separator">
              <th scope="col" className={th}>
                {t.assessment.row}
              </th>
              <th scope="col" className={th}>
                {t.assessment.right}
              </th>
              <th scope="col" className={th}>
                {t.assessment.empty}
              </th>
              <th scope="col" className="py-2 font-medium">
                {t.assessment.commonWrong}
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positions in the table
              <tr key={i} className="border-b border-separator/60 last:border-0">
                <th scope="row" className="py-2 pr-4 font-medium whitespace-nowrap">
                  {trace?.rows[i]?.label || t.assessment.rowN(i + 1)}
                </th>
                <td className="py-2 pr-4 tabular-nums">
                  <Share n={row.right} of={row.of} />
                </td>
                <td className="py-2 pr-4 tabular-nums">{row.empty}</td>
                <td className="py-2">
                  {row.wrong
                    ? row.wrong.value === null
                      ? t.assessment.wrongColumn(
                          columnName(row.wrong.key, trace, T, t.assessment.anyVertex),
                          row.wrong.count,
                        )
                      : t.assessment.wrongValue(
                          columnName(row.wrong.key, trace, T, t.assessment.anyVertex),
                          valueText(row.wrong.key, row.wrong.value, trace, T) || t.assessment.unreadable,
                          row.wrong.count,
                        )
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
    </div>
  );
}

/** A column as the table names it: `dist[B]`, `D[A][C]`, or a variant's `dist[v]`. */
function columnName(key: string, trace: Trace | null, T: TraceText, anyVertex: string) {
  if (key === 'D') return 'D[i][j]';
  if (key === 'd') return T.words.cols.dist(anyVertex);
  const [i, j] = key.split(',');
  if (j !== undefined) return `D[${i}][${j}]`;
  return (
    trace?.columns.find((c) => c.key === key)?.label ??
    (key.startsWith('d:')
      ? T.words.cols.dist(key.slice(2))
      : (T.words.cols[key as keyof TraceText['words']['cols']] as string))
  );
}

/** A canonical value as the table shows it: "accept" as "pranohet", "yes" as "po". */
function valueText(key: string, value: string, trace: Trace | null, T: TraceText) {
  const column = trace?.matrix ? trace.columns[0] : trace?.columns.find((c) => c.key === key);
  return column ? display(column.kind, value, T.words) : value;
}

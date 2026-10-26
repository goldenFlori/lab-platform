import { useState } from 'react';
import { display, type Trace, type TraceWords } from './algorithms/trace';

// A graded trace table being filled (#168): every row at once, nothing checked here; the answers are
// saved as the student types and the server scores them once handed in. Read-only once it closes.

export function TraceHandIn({
  trace,
  W,
  rows: saved,
  editable,
  onChange,
  label,
}: {
  trace: Trace;
  W: TraceWords;
  rows: Record<string, string>[];
  editable: boolean;
  onChange: (rows: Record<string, string>[]) => void;
  label: (row: string, column: string) => string;
}) {
  const [rows, setRows] = useState<Record<string, string>[]>(() => trace.rows.map((_, i) => saved[i] ?? {}));
  const set = (i: number, key: string, value: string) => {
    const next = rows.map((row, k) => (k === i ? { ...row, [key]: value } : row));
    setRows(next);
    onChange(next);
  };
  const cell =
    'w-full min-w-[3rem] rounded-lg border border-border bg-surface px-2 py-1.5 text-center font-mono text-sm outline-none focus:border-accent';
  const value = (i: number, key: string) =>
    editable ? (
      <input
        aria-label={label(trace.rows[i]?.label ?? '', key)}
        className={cell}
        value={rows[i]?.[key] ?? ''}
        onChange={(e) => set(i, key, e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
    ) : (
      <span className="font-mono">{rows[i]?.[key] || '·'}</span>
    );

  if (trace.matrix) {
    const L = trace.matrix;
    return (
      <div className="grid gap-3 sm:grid-cols-2" data-testid="trace-hand-in">
        {trace.rows.map((row, i) => (
          <section key={row.label} className="rounded-2xl border border-border p-3">
            <h4 className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">{row.label}</h4>
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm">
                <thead>
                  <tr>
                    <th />
                    {L.map((b) => (
                      <th key={b} className="px-1 pb-1 text-xs text-muted">
                        {b}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {L.map((a) => (
                    <tr key={a}>
                      <th className="pr-1.5 text-right text-xs text-muted">{a}</th>
                      {L.map((b) => (
                        <td key={b} className="p-0.5 text-center">
                          {value(i, `${a},${b}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-border" data-testid="trace-hand-in">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-secondary text-left text-xs text-muted">
          <tr>
            <th className="px-2 py-2 font-semibold" />
            {trace.columns.map((c) => (
              <th key={c.key} className="px-2 py-2 font-semibold whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-separator text-muted">
            <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{trace.given.label}</th>
            {trace.columns.map((c) => (
              <td key={c.key} className="px-2 py-1.5 text-center font-mono">
                {display(c.kind, trace.given.cells[c.key] ?? '', W)}
              </td>
            ))}
          </tr>
          {trace.rows.map((row, i) => (
            <tr key={row.label} className="border-t border-separator">
              <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{row.label}</th>
              {trace.columns.map((c) => (
                <td key={c.key} className="px-1.5 py-1 text-center">
                  {value(i, c.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

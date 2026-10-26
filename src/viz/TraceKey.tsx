import type { Trace } from './algorithms/trace';
import { display, type TraceWords } from './algorithms/trace';

/** The expected table of a trace problem, compactly, for staff (#166, #167). */
export function TraceKey({ trace, W }: { trace: Trace; W: TraceWords }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse font-mono text-xs">
        <tbody>
          {[trace.given, ...trace.rows].map((row) => (
            <tr key={row.label} className="border-t border-separator">
              <th className="pr-3 text-left font-sans font-medium whitespace-nowrap">{row.label}</th>
              {trace.matrix
                ? trace.matrix.map((a) => (
                    <td key={a} className="px-1.5 py-1 whitespace-nowrap">
                      {(trace.matrix ?? []).map((b) => row.cells[`${a},${b}`]).join(' ')}
                    </td>
                  ))
                : trace.columns.map((c) => (
                    <td key={c.key} className="px-1.5 py-1 whitespace-nowrap">
                      <span className="text-muted">{c.label}: </span>
                      {display(c.kind, row.cells[c.key] ?? '', W)}
                    </td>
                  ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

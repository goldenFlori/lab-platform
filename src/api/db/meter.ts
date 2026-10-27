// Counting what the database does (#176): queries, rows read and rows written, the units the free
// plan's daily limits are in. Off in production; the measurement script and tests switch it on.

export type Tally = { queries: number; read: number; written: number };

export const emptyTally = (): Tally => ({ queries: 0, read: 0, written: 0 });

/** Whether a statement only reads, so running it twice to see its cost changes nothing. */
const READS = /^\s*(select|with)\b/i;

/**
 * The database, adding every query's cost to `tally`. D1 reports a statement's rows only with
 * run(), all() and batch(); raw(), which Drizzle uses for single rows and joins, has no meta. So a
 * reading raw() is also run with all() to learn its cost, and a writing one (an insert's returning)
 * is run with all() and given back as arrays.
 */
export function meterD1(
  d1: D1Database,
  tally: Tally,
  onQuery?: (sql: string, meta: D1Meta | undefined) => void,
): D1Database {
  // batch() needs the runtime's own statements, not these wrappers.
  const real = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  const add = (meta: D1Meta | undefined, sql = '(batch)') => {
    onQuery?.(sql, meta);
    tally.queries++;
    tally.read += meta?.rows_read ?? 0;
    tally.written += meta?.rows_written ?? 0;
  };
  const statement = (stmt: D1PreparedStatement, sql: string): D1PreparedStatement => {
    const wrapped = new Proxy(stmt, {
      get(target, key) {
        if (key === 'bind') return (...values: unknown[]) => statement(target.bind(...values), sql);
        if (key === 'run' || key === 'all') {
          return async () => {
            const result = await target[key]();
            add(result.meta, sql);
            return result;
          };
        }
        if (key === 'first') {
          return async (column?: string) => {
            const result = await target.all<Record<string, unknown>>();
            add(result.meta, sql);
            const row = result.results[0] ?? null;
            return column && row ? row[column] : row;
          };
        }
        if (key === 'raw') {
          return async (options?: { columnNames?: boolean }) => {
            if (READS.test(sql)) {
              add((await target.all()).meta, sql);
              return options?.columnNames ? target.raw({ columnNames: true }) : target.raw();
            }
            const result = await target.all<Record<string, unknown>>();
            add(result.meta, sql);
            const rows = result.results.map((row) => Object.values(row));
            return options?.columnNames ? [Object.keys(result.results[0] ?? {}), ...rows] : rows;
          };
        }
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    real.set(wrapped, stmt);
    return wrapped;
  };
  return new Proxy(d1, {
    get(target, key) {
      if (key === 'prepare') return (sql: string) => statement(target.prepare(sql), sql);
      if (key === 'batch') {
        return async (statements: D1PreparedStatement[]) => {
          const results = await target.batch(statements.map((s) => real.get(s) ?? s));
          for (const result of results) add(result.meta);
          return results;
        };
      }
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

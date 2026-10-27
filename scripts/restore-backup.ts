// Proves a weekly backup restores (#181):
//
//   npm run backup:restore [-- --file lab-platform-YYYY-MM-DD.sql.age] [--key ~/lab-platform-backup.key]
//                             [--no-build] [--keep] [--prepared restore.sql]
//
// Without --file it downloads the latest successful Backup workflow's artifact (gh). It decrypts it
// with the owner's age key, restores it into a new local database, and checks it:
//   - which migration the backup is at; the newer ones apply to it, as a deploy would apply them;
//   - every table the code's migrations make is then there;
//   - SQLite's integrity and foreign-key checks pass;
//   - every stored file has all its chunks, and every finished notebook its rendering;
//   - the app itself runs on it: a throwaway coordinator, added to the copy only, opens a course,
//     a lab and a notebook through the API.
// It prints names of tables and counts, never contents. The plaintext (the SQL and the local copy)
// lives in a private temporary folder deleted at the end, unless --keep; never commit or upload it.

import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, stripVTControlCharacters } from 'node:util';

/** A table and its rows, from SQLite; the restore's checks in one list. */
export type Check = { name: string; ok: boolean; detail: string };

/** wrangler d1 execute --json answers [{ results: [...] }]; the rows of the first statement. */
export function rowsOf<T>(json: string): T[] {
  const parsed = JSON.parse(json) as { results?: T[] }[];
  return parsed[0]?.results ?? [];
}

/** The tables the migrations make that the backup lacks (D1's own and SQLite's left aside). */
export function missingTables(expected: string[], restored: string[]) {
  const have = new Set(restored);
  return expected.filter((name) => !have.has(name)).sort();
}

export const isOwnTable = (name: string) => !/^(sqlite_|_cf_|d1_)/.test(name);

/** One query counting every table's rows, as one row with a column per table (D1 caps UNIONs). */
export const countQuery = (tables: string[]) =>
  `SELECT ${tables.map((t) => `(SELECT COUNT(*) FROM ${quoteName(t)}) AS ${quoteName(t)}`).join(', ')}`;

/**
 * SQL statements, split at semicolons outside strings ('' is a quote inside one), so code a student
 * saved, with its own semicolons and line breaks, stays whole.
 */
export function statements(sql: string): string[] {
  const out: string[] = [];
  let start = 0;
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") inString = !inString;
    else if (ch === ';' && !inString) {
      const statement = sql.slice(start, i + 1).trim();
      if (statement !== ';') out.push(statement);
      start = i + 1;
    }
  }
  const rest = sql.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/** D1 refuses a statement longer than 100 KB of SQL; below that with room to spare. */
export const MAX_STATEMENT = 90_000;
/** A long value goes in pieces of this many characters. */
const PIECE = 60_000;

/** Values or definitions separated by commas outside strings and parentheses. */
function topLevel(list: string) {
  const out: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === "'") inString = !inString;
    else if (!inString && ch === '(') depth++;
    else if (!inString && ch === ')') depth--;
    else if (!inString && depth === 0 && ch === ',') {
      out.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(list.slice(start).trim());
  return out;
}

const unquote = (name: string) => name.replace(/^[`"[]|[`"\]]$/g, '');
const quoteName = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** A table's columns in order and its primary key, from its CREATE TABLE. */
export function tableShape(create: string) {
  const name = unquote(create.match(/^CREATE TABLE (?:IF NOT EXISTS )?([`"[]?[^\s(`"\]]+[`"\]]?)/i)?.[1] ?? '');
  const body = create.slice(create.indexOf('(') + 1, create.lastIndexOf(')'));
  const columns: string[] = [];
  let key: string[] = [];
  for (const part of topLevel(body)) {
    const constraint = part.match(/^(?:CONSTRAINT\s+\S+\s+)?PRIMARY KEY\s*\(([^)]*)\)/i);
    if (constraint?.[1]) key = constraint[1].split(',').map((c) => unquote(c.trim()));
    else if (/^[`"[]/.test(part) || /^[a-z_]/i.test(part)) {
      if (/^(CONSTRAINT|FOREIGN|UNIQUE|CHECK)\b/i.test(part)) continue;
      const column = unquote(part.split(/\s+/)[0] ?? '');
      columns.push(column);
      if (/\bPRIMARY KEY\b/i.test(part)) key = [column];
    }
  }
  return { name, columns, key };
}

/**
 * An INSERT too long for D1, as statements that fit: the row with its long values empty, then each
 * long value in pieces into _restore_pieces, put together into the row by its primary key: binary
 * (X'…') with unhex, text as text. Null when it cannot be split safely.
 */
export function splitInsert(insert: string, shapes: Map<string, ReturnType<typeof tableShape>>): string[] | null {
  const head = insert.match(/^INSERT INTO ([`"]?[^\s(`"]+[`"]?)\s*(\(([^)]*)\))?\s*VALUES\s*\(/i);
  if (!head) return null;
  const table = unquote(head[1] ?? '');
  const shape = shapes.get(table);
  const columns = head[3] ? head[3].split(',').map((c) => unquote(c.trim())) : shape?.columns;
  const values = topLevel(insert.slice(head[0].length, insert.lastIndexOf(')')));
  if (!shape?.key.length || !columns || columns.length !== values.length) return null;
  const keyValues = shape.key.map((k) => values[columns.indexOf(k)]);
  if (keyValues.some((v) => v === undefined)) return null;
  const where = shape.key.map((k, i) => `${quoteName(k)} = ${keyValues[i]}`).join(' AND ');
  const after: string[] = [];
  const row = values.map((value, i) => {
    if (value.length <= PIECE) return value;
    const column = quoteName(columns[i] as string);
    const blob = /^X'[0-9A-F]*'$/i.test(value);
    const text = /^'.*'$/s.test(value);
    if (!blob && !text) return value;
    const raw = blob ? value.slice(2, -1) : value.slice(1, -1).replace(/''/g, "'");
    for (let k = 0, at = 0; at < raw.length; k++, at += PIECE) {
      const piece = raw.slice(at, at + PIECE).replace(/'/g, "''");
      after.push(`INSERT INTO _restore_pieces (k, v) VALUES (${k}, '${piece}');`);
    }
    const whole = "(SELECT group_concat(v, '' ORDER BY k) FROM _restore_pieces)";
    after.push(`UPDATE ${quoteName(table)} SET ${column} = ${blob ? `unhex(${whole})` : whole} WHERE ${where};`);
    after.push('DELETE FROM _restore_pieces;');
    return blob ? "X''" : "''";
  });
  return [`${insert.slice(0, head[0].length)}${row.join(',')});`, ...after];
}

/**
 * A D1 export, in a form D1 can import. `wrangler d1 export` writes each table with its rows and
 * every index at the end; but our tables point at their parents by (id, org_id), and SQLite needs the
 * parent's unique index on those columns before a child row arrives ("foreign key mismatch"). So:
 * pragmas, then every table, then every index, then the rows in their order (with
 * defer_foreign_keys, a child row may come before its parent's). And a row longer than D1's 100 KB
 * per statement, as file chunks are, is split (splitInsert).
 */
export function prepareExport(sql: string) {
  const parts = { pragma: [] as string[], tables: [] as string[], indexes: [] as string[], rows: [] as string[] };
  const shapes = new Map<string, ReturnType<typeof tableShape>>();
  for (const statement of statements(sql)) {
    const head = statement.slice(0, 40).toUpperCase();
    if (head.startsWith('PRAGMA')) parts.pragma.push(statement);
    else if (head.startsWith('CREATE TABLE')) {
      parts.tables.push(statement);
      const shape = tableShape(statement);
      shapes.set(shape.name, shape);
    } else if (head.startsWith('CREATE INDEX') || head.startsWith('CREATE UNIQUE INDEX')) parts.indexes.push(statement);
    else parts.rows.push(statement);
  }
  const rows = parts.rows.flatMap((row) =>
    row.length > MAX_STATEMENT && row.toUpperCase().startsWith('INSERT') ? (splitInsert(row, shapes) ?? [row]) : [row],
  );
  const pieces = rows.length !== parts.rows.length;
  return [
    ...parts.pragma,
    ...parts.tables,
    ...parts.indexes,
    ...(pieces ? ['CREATE TABLE _restore_pieces (k INTEGER NOT NULL, v TEXT NOT NULL);'] : []),
    ...rows,
    ...(pieces ? ['DROP TABLE _restore_pieces;'] : []),
  ].join('\n');
}

const BROKEN_FILES = `SELECT COUNT(*) AS n FROM files f
  WHERE f.chunk_count <> (SELECT COUNT(*) FROM file_chunks c WHERE c.file_id = f.id AND c.org_id = f.org_id)`;
const NOTEBOOKS_WITHOUT_RENDERING = `SELECT COUNT(*) AS n FROM notebooks n WHERE n.ready_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM files f WHERE f.notebook_id = n.id AND f.org_id = n.org_id AND f.name = 'rendered.json')`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values: args } = parseArgs({
    options: {
      file: { type: 'string' },
      key: { type: 'string', default: join(homedir(), 'lab-platform-backup.key') },
      'no-build': { type: 'boolean', default: false },
      keep: { type: 'boolean', default: false },
      /** Also write the prepared SQL here, to import into a real database after a disaster. */
      prepared: { type: 'string' },
    },
  });
  const fail = (message: string): never => {
    console.error(`✖ ${message}`);
    process.exit(1);
  };
  /** A command's output; a failing one stops the restore with its own error line, not a stack. */
  const run = (cmd: string, cmdArgs: string[], env: Record<string, string> = {}) => {
    try {
      return execFileSync(cmd, cmdArgs, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 256 * 1024 * 1024,
        env: { ...process.env, ...env },
      });
    } catch (error) {
      const { stderr: err, stdout: out } = error as { stderr?: string; stdout?: string };
      // wrangler --json puts its error in the output: {"error":{"text":"…"}}.
      const stderr = String(err || out?.match(/"text":\s*"([^"]*)"/)?.[1] || out || '');
      // Without wrangler's colours.
      const line =
        stripVTControlCharacters(stderr)
          .split('\n')
          .find((l) => /error|✘/i.test(l)) ?? stderr.trim();
      throw new Error(`${cmd} ${cmdArgs.slice(0, 4).join(' ')}: ${line.trim()}`);
    }
  };

  const work = mkdtempSync(join(tmpdir(), 'lab-restore-'));
  chmodSync(work, 0o700);
  const restored = join(work, 'restored');
  const reference = join(work, 'reference');
  let server: ChildProcess | null = null;
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, ok, detail });
    console.log(`${ok ? '✓' : '✗'} ${name}: ${detail}`);
  };
  const sql = (state: string, command: string) =>
    run('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', state, '--json', '--command', command]);

  try {
    // 1. The encrypted backup.
    let encrypted = args.file ? resolve(args.file) : '';
    if (!encrypted) {
      const id = run('gh', [
        'run',
        'list',
        '--workflow',
        'Backup',
        '--status',
        'success',
        '--limit',
        '1',
        '--json',
        'databaseId',
        '-q',
        '.[0].databaseId',
      ]).trim();
      if (!id) fail('No successful Backup run was found.');
      run('gh', ['run', 'download', id, '--dir', join(work, 'artifact')]);
      // gh puts each artifact in a folder of the same name: the file inside it.
      const found = readdirSync(join(work, 'artifact'), { recursive: true, encoding: 'utf8' }).find(
        (f) => f.endsWith('.sql.age') && statSync(join(work, 'artifact', f)).isFile(),
      );
      encrypted = found ? join(work, 'artifact', found) : fail('The run has no .sql.age artifact.');
    }
    console.log(`Backup: ${encrypted.split('/').pop()}\n`);

    // 2. Decrypted, only inside the private folder.
    const plain = join(work, 'backup.sql');
    run('age', [
      '--decrypt',
      '--identity',
      resolve(args.key.replace(/^~(?=\/)/, homedir())),
      '--output',
      plain,
      encrypted,
    ]);
    check('decrypts with the owner’s key', true, 'yes');

    // 3. Restored into a new local database, in an order D1 can import; the code's own schema beside it.
    const prepared = join(work, 'prepared.sql');
    writeFileSync(prepared, prepareExport(readFileSync(plain, 'utf8')), { mode: 0o600 });
    if (args.prepared) {
      writeFileSync(resolve(args.prepared), readFileSync(prepared), { mode: 0o600 });
      console.log(`Prepared for import (plaintext, delete it after use): ${resolve(args.prepared)}`);
    }
    run('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', restored, '--file', prepared]);
    // A backup older than the newest migrations is normal: as a deploy would, bring it up to date.
    const appliedNames = () =>
      rowsOf<{ name: string }>(sql(restored, 'SELECT name FROM d1_migrations ORDER BY id')).map((r) => r.name);
    const before = appliedNames();
    run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', restored]);
    const newer = appliedNames().filter((name) => !before.includes(name));
    check(
      'its migrations',
      true,
      `${before.length} in the backup${newer.length ? `; the ${newer.length} newer applied: ${newer.join(', ')}` : ', as in the code'}`,
    );

    run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', reference]);
    const tablesQuery = "SELECT name FROM sqlite_master WHERE type = 'table'";
    const restoredTables = rowsOf<{ name: string }>(sql(restored, tablesQuery))
      .map((r) => r.name)
      .filter(isOwnTable);
    const expected = rowsOf<{ name: string }>(sql(reference, tablesQuery))
      .map((r) => r.name)
      .filter(isOwnTable);
    const missing = missingTables(expected, restoredTables);
    check(
      'every table is there',
      missing.length === 0,
      missing.length ? `missing ${missing.join(', ')}` : `${restoredTables.length} tables`,
    );

    // D1 allows quick_check, not the full integrity_check.
    const integrity = rowsOf<{ quick_check: string }>(sql(restored, 'PRAGMA quick_check'))[0]?.quick_check;
    check('SQLite integrity', integrity === 'ok', integrity ?? 'no answer');
    const orphans = rowsOf(sql(restored, 'PRAGMA foreign_key_check')).length;
    check('no broken links between rows', orphans === 0, orphans ? `${orphans} rows point at nothing` : 'none');
    const broken = rowsOf<{ n: number }>(sql(restored, BROKEN_FILES))[0]?.n ?? -1;
    check('files complete', broken === 0, broken ? `${broken} files miss chunks` : 'every file has all its chunks');
    const unrendered = rowsOf<{ n: number }>(sql(restored, NOTEBOOKS_WITHOUT_RENDERING))[0]?.n ?? -1;
    check(
      'notebooks rendered',
      unrendered === 0,
      unrendered
        ? `${unrendered} finished notebooks lack their rendering`
        : 'every finished notebook has its rendering',
    );

    console.log('\nRows per table:');
    const counts = rowsOf<Record<string, number>>(sql(restored, countQuery(restoredTables)))[0] ?? {};
    for (const [name, n] of Object.entries(counts)) console.log(`  ${name.padEnd(28)} ${n}`);

    // 4. The app on the restored data: a throwaway coordinator in the copy opens a course.
    const org = rowsOf<{ slug: string }>(
      sql(
        restored,
        'SELECT o.slug FROM organizations o JOIN courses c ON c.org_id = o.id GROUP BY o.id ORDER BY COUNT(*) DESC LIMIT 1',
      ),
    )[0]?.slug;
    if (!org) {
      check('a course opens', true, 'the backup has no course yet');
    } else {
      const password = `Rikthim-${crypto.randomUUID()}`;
      run(
        'node',
        [
          'scripts/create-account.ts',
          '--org-slug',
          org,
          '--org-name',
          org,
          '--username',
          'restore.check',
          '--full-name',
          'Restore Check',
          '--role',
          'coordinator',
          '--persist-to',
          restored,
        ],
        { ACCOUNT_PASSWORD: password },
      );
      if (!args['no-build']) run('npm', ['run', 'build']);
      const port = 4194;
      const base = `http://localhost:${port}`;
      server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
        stdio: 'ignore',
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
          AI_PROVIDER: 'fake',
          LIVE_JURISDICTION: 'none',
          LOCAL_STATE: restored,
        },
      });
      let up = false;
      for (let i = 0; i < 120 && !up; i++) {
        up = await fetch(`${base}/api/health`).then(
          (r) => r.ok,
          () => false,
        );
        if (!up) await new Promise((r) => setTimeout(r, 500));
      }
      if (!up) fail('The app did not start on the restored copy.');
      const login = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: base },
        body: JSON.stringify({ username: 'restore.check', password }),
      });
      const cookie = login.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ');
      const get = async <T>(path: string) => {
        const res = await fetch(`${base}/api${path}`, { headers: { Cookie: cookie } });
        if (!res.ok) throw new Error(`${path}: ${res.status}`);
        return (await res.json()) as T;
      };
      try {
        const [course] = await get<{ id: string; title: string }[]>(`/orgs/${org}/courses`);
        if (!course) throw new Error('no course listed');
        const { labs } = await get<{ labs: { id: string; n: number }[] }>(`/orgs/${org}/courses/${course.id}/labs`);
        const opened = [];
        for (const lab of labs) {
          const path = `/orgs/${org}/courses/${course.id}/labs/${lab.id}/notebooks`;
          const { notebooks } = await get<{ notebooks: { id: string; ready: boolean }[] }>(path);
          const nb = notebooks.find((n) => n.ready);
          if (!nb) continue;
          await get(`${path}/${nb.id}`);
          const rendered = await fetch(`${base}/api${path}/${nb.id}/files/rendered.json`, {
            headers: { Cookie: cookie },
          });
          if (!rendered.ok) throw new Error(`lab ${lab.n}'s notebook rendering: ${rendered.status}`);
          opened.push(lab.n);
          break;
        }
        check(
          'a course opens in the app',
          login.ok,
          `${labs.length} labs; ${opened.length ? `lab ${opened[0]}'s notebook opens with its rendering` : 'no finished notebook yet'}`,
        );
      } catch (error) {
        check('a course opens in the app', false, String(error instanceof Error ? error.message : error));
      }
    }
  } catch (error) {
    check('the restore', false, error instanceof Error ? error.message : String(error));
  } finally {
    if (server) {
      server.kill();
      try {
        run('pkill', ['-f', 'vite preview --port 4194']);
      } catch {
        // Already gone.
      }
    }
    if (args.keep) console.log(`\nKept (plaintext, delete it yourself): ${work}`);
    else rmSync(work, { recursive: true, force: true });
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(failed.length ? `\n✖ ${failed.length} check(s) failed.` : '\n✔ The backup restores.');
  process.exit(failed.length ? 1 : 0);
}

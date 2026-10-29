import { describe, expect, it } from 'vitest';
import {
  countQuery,
  isOwnTable,
  MAX_STATEMENT,
  missingTables,
  prepareExport,
  rowsOf,
  splitInsert,
  statements,
  tableShape,
} from '../../scripts/restore-backup';

// #181: the restore check reads wrangler's answers, finds the tables a backup lacks, and counts rows
// without reading them.

describe('npm run backup:restore', () => {
  it('reads the rows of wrangler d1 execute --json', () => {
    expect(rowsOf('[{"results":[{"name":"users"}],"success":true}]')).toEqual([{ name: 'users' }]);
    expect(rowsOf('[]')).toEqual([]);
  });

  it('names the tables the migrations make and the backup lacks, ignoring D1’s and SQLite’s own', () => {
    const expected = ['users', 'courses', 'kolokium_starts'].filter(isOwnTable);
    const restored = ['users', 'courses', 'd1_migrations', '_cf_KV', 'sqlite_sequence'].filter(isOwnTable);
    expect(restored).toEqual(['users', 'courses']);
    expect(missingTables(expected, restored)).toEqual(['kolokium_starts']);
  });

  it('counts every table in one row, quoting names', () => {
    expect(countQuery(['users', 'odd"name'])).toBe(
      'SELECT (SELECT COUNT(*) FROM "users") AS "users", (SELECT COUNT(*) FROM "odd""name") AS "odd""name"',
    );
  });
});

describe('preparing a D1 export for import', () => {
  const EXPORT = [
    'PRAGMA defer_foreign_keys=TRUE;',
    'CREATE TABLE `courses` (`id` text PRIMARY KEY NOT NULL,\n  `org_id` text NOT NULL);',
    `INSERT INTO "courses" VALUES('c1','o1');`,
    'CREATE TABLE `groups` (`id` text, `course_id` text, `org_id` text,\n  FOREIGN KEY (`course_id`,`org_id`) REFERENCES `courses`(`id`,`org_id`));',
    `INSERT INTO "groups" VALUES('g1','c1','o1');`,
    "INSERT INTO \"code_edits\" VALUES('e1','x = 1; y = 2\nprint('';'')');",
    'CREATE UNIQUE INDEX `courses_id_org_unique` ON `courses` (`id`,`org_id`);',
  ].join('\n');

  it('splits statements outside strings only', () => {
    expect(statements(EXPORT)).toHaveLength(7);
    expect(statements(EXPORT)[5]).toBe("INSERT INTO \"code_edits\" VALUES('e1','x = 1; y = 2\nprint('';'')');");
  });

  it('puts every table, then every index, before any row', () => {
    const order = statements(prepareExport(EXPORT)).map((s) => s.split(/[ (]/).slice(0, 2).join(' '));
    expect(order).toEqual([
      'PRAGMA defer_foreign_keys=TRUE;',
      'CREATE TABLE',
      'CREATE TABLE',
      'CREATE UNIQUE',
      'INSERT INTO',
      'INSERT INTO',
      'INSERT INTO',
    ]);
  });
});

describe('rows too long for one D1 statement', () => {
  const CHUNKS = [
    'CREATE TABLE `file_chunks` (',
    '\t`org_id` text NOT NULL,',
    '\t`file_id` text NOT NULL,',
    '\t`n` integer NOT NULL,',
    '\t`data` blob NOT NULL,',
    '\tCONSTRAINT `file_chunks_pk` PRIMARY KEY(`org_id`, `file_id`, `n`),',
    '\tFOREIGN KEY (`file_id`,`org_id`) REFERENCES `files`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade',
    ');',
  ].join('\n');
  const EDITS = 'CREATE TABLE `code_edits` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`code` text NOT NULL\n);';
  const shapes = new Map([CHUNKS, EDITS].map((c) => [tableShape(c).name, tableShape(c)]));

  it('reads a table’s columns and primary key', () => {
    expect(tableShape(CHUNKS)).toEqual({
      name: 'file_chunks',
      columns: ['org_id', 'file_id', 'n', 'data'],
      key: ['org_id', 'file_id', 'n'],
    });
    expect(tableShape(EDITS).key).toEqual(['id']);
  });

  it('splits a long blob and a long text, and puts them back by the primary key', () => {
    const hex = 'AB'.repeat(70_000);
    const blob = splitInsert(`INSERT INTO "file_chunks" VALUES('o1','f1',0,X'${hex}');`, shapes);
    expect(blob?.[0]).toBe(`INSERT INTO "file_chunks" VALUES('o1','f1',0,X'');`);
    expect(blob?.filter((s) => s.startsWith('INSERT INTO _restore_pieces'))).toHaveLength(3);
    expect(blob).toContain(
      `UPDATE "file_chunks" SET "data" = unhex((SELECT group_concat(v, '' ORDER BY k) FROM _restore_pieces)) WHERE "org_id" = 'o1' AND "file_id" = 'f1' AND "n" = 0;`,
    );
    expect(blob?.every((s) => s.length < MAX_STATEMENT)).toBe(true);

    const code = `print('it''s')\n`.repeat(8_000);
    const text = splitInsert(`INSERT INTO "code_edits" VALUES('e1','${code.replace(/'/g, "''")}');`, shapes);
    const pieces = (text ?? [])
      .filter((s) => s.startsWith('INSERT INTO _restore_pieces'))
      .map((s) => s.slice(s.indexOf(", '") + 3, -3).replace(/''/g, "'"));
    expect(pieces.join('')).toBe(code);
  });

  it('leaves alone what it cannot split safely', () => {
    expect(splitInsert(`INSERT INTO "unknown" VALUES('${'x'.repeat(100_000)}');`, shapes)).toBeNull();
  });

  it('prepares an export so that every statement fits', () => {
    const sql = `${CHUNKS}\nINSERT INTO "file_chunks" VALUES('o1','f1',0,X'${'00'.repeat(200_000)}');`;
    const prepared = statements(prepareExport(sql));
    expect(prepared.every((s) => s.length < MAX_STATEMENT)).toBe(true);
    expect(prepared.at(-1)).toBe('DROP TABLE _restore_pieces;');
  });
});

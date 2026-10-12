import { Alert, Button } from '@heroui/react';
import { ClipboardCheck, Plus, ScanSearch, Trash2 } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { detectExercises } from '../../../notebook/exercises';
import type { StoredNotebook } from '../../../notebook/stored';
import { MAX_EXERCISES, MAX_TEST } from '../../../shared/exercise-limits';
import type { Exercise } from '../../../shared/exercises';
import { type Messages, useT } from '../../i18n';
import { cellChoices } from './EmbedsEditor';
import { VariantMaker, type VariantTarget } from './VariantMaker';

// Staff choose a notebook's exercises (#51): the cell whose run checks each one, its title, and a
// visible test where the cell does not check itself with kontrollo(…).

type Row = { key: string; cell: string; title: string; test: string };

const toRows = (exercises: Exercise[]): Row[] =>
  exercises.map((e) => ({ key: crypto.randomUUID(), cell: String(e.cell), title: e.title, test: e.test ?? '' }));

function parseRows(t: Messages, rows: Row[]): Exercise[] | string {
  const exercises: Exercise[] = [];
  for (const [i, row] of rows.entries()) {
    if (row.cell === '' || !row.title.trim()) return t.exercises.pickBoth(i + 1);
    exercises.push({ cell: Number(row.cell), title: row.title.trim(), test: row.test.trim() ? row.test : null });
  }
  if (new Set(exercises.map((e) => e.cell)).size !== exercises.length) return t.exercises.oneEach;
  return exercises.sort((a, b) => a.cell - b.cell);
}

export function ExercisesEditor({
  notebook,
  exercises,
  isPending,
  onSave,
  variants,
}: {
  notebook: StoredNotebook;
  exercises: Exercise[];
  isPending: boolean;
  onSave: (exercises: Exercise[]) => Promise<unknown>;
  /** Where the copilot's variants of the saved exercises go (#85). */
  variants: VariantTarget;
}) {
  const t = useT();
  // Only code that can run can check an exercise.
  const cells = useMemo(() => {
    const code = new Set(notebook.cells.flatMap((c) => (c.type === 'code' && !c.interactive ? [c.srcIndex] : [])));
    return cellChoices(t, notebook).filter(([cell]) => code.has(cell));
  }, [t, notebook]);
  const [rows, setRows] = useState<Row[]>(() => toRows(exercises));
  const [status, setStatus] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);

  const change = (key: string, field: keyof Row, value: string) =>
    setRows((list) => list.map((row) => (row.key === key ? { ...row, [field]: value } : row)));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseRows(t, rows);
    if (typeof parsed === 'string') return setStatus({ tone: 'danger', text: parsed });
    try {
      await onSave(parsed);
      setStatus({ tone: 'success', text: t.exercises.saved });
    } catch {
      setStatus({ tone: 'danger', text: t.exercises.saveFailed });
    }
  }

  const field = 'w-full min-w-0 rounded-xl border border-border bg-surface px-3';
  return (
    <details className="group rounded-2xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
        <ClipboardCheck className="size-4 shrink-0 text-accent" aria-hidden="true" />
        <span className="flex-1 text-sm font-semibold">{t.exercises.editorTitle(exercises.length)}</span>
        <span className="text-xs text-muted group-open:hidden">{t.exercises.edit}</span>
      </summary>
      <form onSubmit={submit} aria-label={t.exercises.form} className="border-t border-border p-4">
        <p className="text-sm text-muted">{t.exercises.help}</p>
        <ul className="mt-4 grid gap-3">
          {rows.map((row, i) => (
            <li key={row.key}>
              <fieldset className="grid gap-3 rounded-xl bg-surface-secondary p-3 sm:grid-cols-2">
                <legend className="sr-only">{t.exercises.row(i + 1)}</legend>
                <label className="grid min-w-0 gap-1 text-sm">
                  <span className="font-medium">{t.exercises.cell}</span>
                  <select
                    value={row.cell}
                    onChange={(e) => change(row.key, 'cell', e.target.value)}
                    className={`${field} h-10`}
                  >
                    <option value="">{t.exercises.pick}</option>
                    {cells.map(([cell, label]) => (
                      <option key={cell} value={cell}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid min-w-0 gap-1 text-sm">
                  <span className="font-medium">{t.exercises.title}</span>
                  <input
                    value={row.title}
                    maxLength={160}
                    onChange={(e) => change(row.key, 'title', e.target.value)}
                    className={`${field} h-10`}
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-sm sm:col-span-2">
                  <span className="font-medium">{t.exercises.test}</span>
                  <textarea
                    value={row.test}
                    rows={3}
                    maxLength={MAX_TEST}
                    spellCheck={false}
                    placeholder='assert shuma(1, 2) == 3, "shuma(1, 2) duhet 3"'
                    onChange={(e) => change(row.key, 'test', e.target.value)}
                    className={`${field} py-2 font-mono text-[0.85rem]`}
                  />
                  <span className="text-xs text-muted">{t.exercises.testHelp}</span>
                </label>
                <div className="sm:col-span-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                  >
                    <Trash2 className="size-4" /> {t.exercises.remove(i + 1)}
                  </Button>
                </div>
              </fieldset>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          {rows.length < MAX_EXERCISES && (
            <Button
              size="sm"
              variant="secondary"
              onPress={() => setRows((list) => [...list, { key: crypto.randomUUID(), cell: '', title: '', test: '' }])}
            >
              <Plus className="size-4" /> {t.exercises.add}
            </Button>
          )}
          <Button size="sm" variant="ghost" onPress={() => setRows(toRows(detectExercises(notebook)))}>
            <ScanSearch className="size-4" /> {t.exercises.detect}
          </Button>
        </div>
        {status && (
          <Alert status={status.tone} className="mt-4">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{status.text}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        <div className="mt-4">
          <Button type="submit" variant="primary" size="sm" isPending={isPending}>
            {t.exercises.save}
          </Button>
        </div>
      </form>
      <div className="border-t border-border px-4 pb-4">
        <VariantMaker notebook={notebook} exercises={exercises} target={variants} />
      </div>
    </details>
  );
}

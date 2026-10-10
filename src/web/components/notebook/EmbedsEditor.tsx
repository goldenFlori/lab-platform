import { Alert, Button } from '@heroui/react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import type { StoredNotebook } from '../../../notebook/stored';
import type { Embed } from '../../../shared/notebooks';
import { VISUALIZER_IDS, VISUALIZERS } from '../../../shared/visualizers';

// Staff choose which visualization appears at which cell of a notebook. The cell is the notebook's
// own cell number, so the choice survives as long as the notebook does.

type Row = { key: string; cell: string; viz: string; title: string; props: string };

const MAX_EMBEDS = 60;

const shorten = (text: string, max = 70) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

/**
 * A short way to recognise each notebook cell: a heading or the start of a text, and for code the
 * section it belongs to (its first line, such as an import, rarely says which exercise it is).
 */
function cellChoices(notebook: StoredNotebook) {
  const choices = new Map<number, string>();
  const parser = new DOMParser();
  let section: string | null = null;
  for (const cell of notebook.cells) {
    if (cell.type === 'markdown' && cell.heading) section = cell.heading;
    if (choices.has(cell.srcIndex) && !(cell.type === 'markdown' && cell.heading)) continue;
    let text: string;
    if (cell.type === 'code') {
      const where = section ?? cell.raw.split('\n').find((line) => line.trim()) ?? '';
      text = `Kod · ${shorten(where, 60)}${cell.interactive ? ' · hap dritare' : ''}`;
    } else {
      // An inert document: nothing in it runs or loads.
      text = shorten(cell.heading ?? parser.parseFromString(cell.html, 'text/html').body.textContent ?? '');
    }
    choices.set(cell.srcIndex, `${cell.srcIndex} · ${text}`);
  }
  return [...choices].sort(([a], [b]) => a - b);
}

const toRows = (embeds: Embed[]): Row[] =>
  embeds.map((embed) => ({
    key: crypto.randomUUID(),
    cell: String(embed.cell),
    viz: embed.viz,
    title: embed.title ?? '',
    props: embed.props ? JSON.stringify(embed.props) : '',
  }));

function parseRows(rows: Row[]): Embed[] | string {
  const embeds: Embed[] = [];
  for (const [i, row] of rows.entries()) {
    const n = i + 1;
    if (row.cell === '' || row.viz === '') return `Zgjidhni qelizën dhe vizualizimin te rreshti ${n}.`;
    let props: Record<string, unknown> | null = null;
    if (row.props.trim()) {
      try {
        const value: unknown = JSON.parse(row.props);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
        props = value as Record<string, unknown>;
      } catch {
        return `Cilësimet te rreshti ${n} duhet të jenë JSON, p.sh. {"preset": "lab"}.`;
      }
    }
    embeds.push({ cell: Number(row.cell), viz: row.viz, title: row.title.trim() || null, props });
  }
  if (new Set(embeds.map((e) => e.cell)).size !== embeds.length) {
    return 'Një qelizë mund të ketë vetëm një vizualizim.';
  }
  return embeds.sort((a, b) => a.cell - b.cell);
}

export function EmbedsEditor({
  notebook,
  embeds,
  isPending,
  onSave,
}: {
  notebook: StoredNotebook;
  embeds: Embed[];
  isPending: boolean;
  onSave: (embeds: Embed[]) => Promise<unknown>;
}) {
  const cells = useMemo(() => cellChoices(notebook), [notebook]);
  const [rows, setRows] = useState<Row[]>(() => toRows(embeds));
  const [status, setStatus] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);

  const change = (key: string, field: keyof Row, value: string) =>
    setRows((list) => list.map((row) => (row.key === key ? { ...row, [field]: value } : row)));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseRows(rows);
    if (typeof parsed === 'string') return setStatus({ tone: 'danger', text: parsed });
    try {
      await onSave(parsed);
      setStatus({ tone: 'success', text: 'Vizualizimet u ruajtën.' });
    } catch {
      setStatus({ tone: 'danger', text: 'Vizualizimet nuk u ruajtën. Provoni sërish.' });
    }
  }

  const field = 'h-10 w-full min-w-0 rounded-xl border border-border bg-surface px-3';
  return (
    <details className="group rounded-2xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
        <Sparkles className="size-4 shrink-0 text-accent" aria-hidden="true" />
        <span className="flex-1 text-sm font-semibold">Vizualizimet në këtë fletore ({embeds.length})</span>
        <span className="text-xs text-muted group-open:hidden">Ndrysho</span>
      </summary>
      <form onSubmit={submit} aria-label="Vizualizimet në këtë fletore" className="border-t border-border p-4">
        <p className="text-sm text-muted">
          Një vizualizim shfaqet pas qelizës së zgjedhur. Te një qelizë që hap dritare në kompjuter, ai shfaqet në vend
          të saj dhe kodi palohet poshtë.
        </p>
        <ul className="mt-4 grid gap-3">
          {rows.map((row, i) => (
            <li key={row.key}>
              <fieldset className="grid gap-3 rounded-xl bg-surface-secondary p-3 sm:grid-cols-2">
                <legend className="sr-only">Vizualizimi {i + 1}</legend>
                <label className="grid min-w-0 gap-1 text-sm">
                  <span className="font-medium">Qeliza</span>
                  <select value={row.cell} onChange={(e) => change(row.key, 'cell', e.target.value)} className={field}>
                    <option value="">Zgjidhni…</option>
                    {cells.map(([cell, label]) => (
                      <option key={cell} value={cell}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid min-w-0 gap-1 text-sm">
                  <span className="font-medium">Vizualizimi</span>
                  <select value={row.viz} onChange={(e) => change(row.key, 'viz', e.target.value)} className={field}>
                    <option value="">Zgjidhni…</option>
                    {VISUALIZER_IDS.map((id) => (
                      <option key={id} value={id}>
                        {VISUALIZERS[id]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid min-w-0 gap-1 text-sm">
                  <span className="font-medium">Titulli (s'është i detyrueshëm)</span>
                  <input
                    value={row.title}
                    maxLength={160}
                    onChange={(e) => change(row.key, 'title', e.target.value)}
                    className={field}
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-sm">
                  <span className="font-medium">Cilësimet, JSON (s'janë të detyrueshme)</span>
                  <input
                    value={row.props}
                    placeholder='{"preset": "lab"}'
                    onChange={(e) => change(row.key, 'props', e.target.value)}
                    className={`${field} font-mono text-[0.85rem]`}
                  />
                </label>
                <div className="sm:col-span-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                  >
                    <Trash2 className="size-4" /> Hiq vizualizimin {i + 1}
                  </Button>
                </div>
              </fieldset>
            </li>
          ))}
        </ul>
        {rows.length < MAX_EMBEDS && (
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            onPress={() =>
              setRows((list) => [...list, { key: crypto.randomUUID(), cell: '', viz: '', title: '', props: '' }])
            }
          >
            <Plus className="size-4" /> Shto vizualizim
          </Button>
        )}
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
            Ruaj vizualizimet
          </Button>
        </div>
      </form>
    </details>
  );
}

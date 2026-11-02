import { Alert, Button } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ListOrdered } from 'lucide-react';
import { useState } from 'react';
import { NOTEBOOK_KINDS, type NotebookKind } from '../../../shared/notebook-files';
import type { NotebookSummary } from '../../../shared/notebooks';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { revealSoon, useLabTool } from '../../lib/lab-tools';

// The lab's notebooks named, made another kind and put in order, in place (#233): their students'
// work, grades and versions stay. From the lab's "More" menu, for staff who manage the lab.

type Row = { id: string; title: string; kind: NotebookKind };

export function NotebooksArrange({ base, notebooks }: { base: string; notebooks: NotebookSummary[] }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  useLabTool('arrange', () => {
    setRows(notebooks.map(({ id, title, kind }) => ({ id, title, kind })));
    setMessage(null);
    revealSoon('[data-testid="notebooks-arrange"]');
  });
  if (!rows) return null;

  const move = (i: number, by: -1 | 1) =>
    setRows((list) => {
      if (!list) return list;
      const next = [...list];
      const [row] = next.splice(i, 1);
      if (row) next.splice(i + by, 0, row);
      return next;
    });
  const change = (id: string, part: Partial<Row>) =>
    setRows((list) => list?.map((r) => (r.id === id ? { ...r, ...part } : r)) ?? list);

  async function save() {
    if (!rows) return;
    setBusy(true);
    setMessage(null);
    try {
      for (const row of rows) {
        const before = notebooks.find((n) => n.id === row.id);
        const changed: Partial<Row> = {};
        if (before && row.title.trim() && row.title.trim() !== before.title) changed.title = row.title.trim();
        if (before && row.kind !== before.kind) changed.kind = row.kind;
        if (Object.keys(changed).length)
          await api(`${base}/${encodeURIComponent(row.id)}`, { method: 'PATCH', body: changed });
      }
      const order = rows.map((r) => r.id);
      if (order.join() !== notebooks.map((n) => n.id).join()) {
        await api(`${base}/order`, { method: 'PUT', body: { ids: order } });
      }
      await queryClient.invalidateQueries({ queryKey: ['orgs'], predicate: (q) => q.queryKey.includes('notebooks') });
      setRows(null);
    } catch {
      setMessage({ tone: 'danger', text: t.arrange.failed });
    } finally {
      setBusy(false);
    }
  }

  const field = 'h-9 rounded-xl border border-border bg-surface px-2 text-sm';
  return (
    <section
      aria-labelledby="notebooks-arrange"
      data-testid="notebooks-arrange"
      className="grid w-full gap-3 rounded-2xl border border-border bg-surface p-4"
    >
      <h2 id="notebooks-arrange" className="flex items-center gap-2 font-semibold">
        <ListOrdered className="size-4 text-accent" aria-hidden="true" /> {t.arrange.title}
      </h2>
      <p className="text-sm text-muted">{t.arrange.help}</p>
      <ol className="grid gap-2">
        {rows.map((row, i) => (
          <li key={row.id} className="flex flex-wrap items-center gap-2">
            <span className="w-6 text-right text-sm text-muted tabular-nums">{i + 1}.</span>
            <input
              value={row.title}
              maxLength={160}
              aria-label={t.arrange.titleOf(i + 1)}
              onChange={(e) => change(row.id, { title: e.target.value })}
              className={`${field} min-w-0 flex-1 basis-48`}
            />
            <select
              value={row.kind}
              aria-label={t.arrange.kindOf(i + 1)}
              onChange={(e) => change(row.id, { kind: e.target.value as NotebookKind })}
              className={field}
            >
              {NOTEBOOK_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t.upload.kinds[kind]}
                </option>
              ))}
            </select>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              isDisabled={i === 0}
              aria-label={t.arrange.up(row.title)}
              onPress={() => move(i, -1)}
            >
              <ArrowUp className="size-4" />
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              isDisabled={i === rows.length - 1}
              aria-label={t.arrange.down(row.title)}
              onPress={() => move(i, 1)}
            >
              <ArrowDown className="size-4" />
            </Button>
          </li>
        ))}
      </ol>
      {message && (
        <Alert status={message.tone}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{message.text}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" isPending={busy} onPress={() => void save()}>
          {t.arrange.save}
        </Button>
        <Button size="sm" variant="ghost" isDisabled={busy} onPress={() => setRows(null)}>
          {t.common.cancel}
        </Button>
      </div>
    </section>
  );
}

import { Button } from '@heroui/react';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../i18n';
import { useCellEdit } from '../../lib/cell-edit';
import { openLabTool } from '../../lib/lab-tools';

/** Under a cell, in edit mode (#232): "Ndrysho këtë qelizë", then its source to change and save. */
export function CellEditSlot({ cell }: { cell: number }) {
  const t = useT();
  const edit = useCellEdit();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  if (!edit) return null;
  if (edit.editing !== cell) {
    return (
      <div className="-mt-4 flex justify-end print:hidden">
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            setText(null);
            setFailed(false);
            edit.open(cell);
          }}
        >
          <Pencil className="size-3.5" /> {t.cellEdit.edit}
        </Button>
      </div>
    );
  }
  const source = text ?? edit.source(cell);
  const busy = edit.progress !== null;
  return (
    <form
      className="grid gap-2 rounded-2xl border border-accent/40 bg-surface p-3"
      data-testid="cell-edit"
      onSubmit={(e) => {
        e.preventDefault();
        if (source === undefined) return;
        setFailed(false);
        edit.save(cell, source).catch(() => setFailed(true));
      }}
    >
      {source === undefined ? (
        <p className="text-sm text-muted">{t.common.loading}</p>
      ) : (
        <textarea
          value={source}
          rows={Math.min(24, Math.max(4, source.split('\n').length + 1))}
          spellCheck={false}
          aria-label={t.cellEdit.label}
          onChange={(e) => setText(e.target.value)}
          className="rounded-xl border border-border bg-[var(--code-bg)] px-3 py-2 font-mono text-[0.85rem]"
        />
      )}
      <p className="text-xs text-muted">{t.cellEdit.help}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="primary" isPending={busy} isDisabled={source === undefined}>
          {t.cellEdit.save}
        </Button>
        <Button size="sm" variant="ghost" isDisabled={busy} onPress={edit.close}>
          {t.common.cancel}
        </Button>
        {busy && (
          <span className="text-xs text-muted" aria-live="polite">
            {t.cellEdit.saving}
          </span>
        )}
        {failed && (
          <span role="alert" className="text-xs text-danger">
            {t.cellEdit.failed}
          </span>
        )}
      </div>
    </form>
  );
}

/** Above the notebook while editing cells (#232): what to do, and how to stop. */
export function CellEditBanner() {
  const t = useT();
  const edit = useCellEdit();
  if (!edit) return null;
  return (
    <div
      className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-2.5 text-sm"
      data-testid="cell-edit-banner"
    >
      <span>
        <Pencil className="mr-1.5 inline size-3.5 text-accent" aria-hidden="true" />
        {t.cellEdit.bannerText}
      </span>
      <Button size="sm" variant="secondary" onPress={() => openLabTool('edit-cells')}>
        {t.cellEdit.done}
      </Button>
    </div>
  );
}

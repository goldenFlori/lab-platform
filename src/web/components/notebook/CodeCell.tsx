import { Check, ChevronDown, Code2, Copy, MonitorSmartphone } from 'lucide-react';
import { useState } from 'react';
import type { CodeCell as Cell } from '../../../notebook/types';
import { sanitize } from '../../lib/sanitize';
import { Output } from './Output';

/**
 * One code cell. Short code shows in full and long code folds away. Code that opens a desktop window
 * (Pygame, Tkinter) or needs a live Jupyter kernel folds completely; its interactive version, if the
 * notebook has one, is shown just above it.
 */
export function CodeCell({ cell, fileUrl }: { cell: Cell; fileUrl: (name: string) => string }) {
  const code = (
    <div
      className="nb-shiki"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized; the converter's highlighted code
      dangerouslySetInnerHTML={{ __html: sanitize(cell.html) }}
    />
  );

  if (cell.interactive) {
    const f = cell.flags;
    const library = f.pygame
      ? 'Pygame'
      : f.tkinter
        ? 'Tkinter'
        : f.widgets
          ? 'Jupyter widgets'
          : f.subprocess
            ? 'program desktop'
            : '';
    return (
      <details className="group rounded-2xl border border-dashed border-border bg-surface-secondary/50">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-default text-muted">
            <MonitorSmartphone className="size-[18px]" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Kodi Python i ushtrimit</span>
            <span className="block text-xs text-muted">
              {library ? `${library} · ` : ''}
              {cell.lines} rreshta · hap një dritare në kompjuterin tuaj
            </span>
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="relative border-t border-dashed border-border">
          <div className="absolute top-2.5 right-2.5 z-10">
            <CopyButton text={cell.raw} />
          </div>
          <div className="max-h-[32rem] overflow-auto">{code}</div>
        </div>
      </details>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-2xl border border-[var(--code-border)] bg-[var(--code-bg)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--code-border)] px-4 py-2">
          <span className="flex items-center gap-2 text-xs font-medium text-muted">
            <Code2 className="size-3.5" aria-hidden="true" /> Python
          </span>
          <CopyButton text={cell.raw} />
        </div>
        {cell.collapsed ? (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm text-muted select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              <span className="group-open:hidden">Shfaq kodin e plotë · {cell.lines} rreshta</span>
              <span className="hidden group-open:inline">Fshih kodin</span>
            </summary>
            <div className="border-t border-[var(--code-border)]">{code}</div>
          </details>
        ) : (
          code
        )}
      </div>
      {cell.outputs.map((out, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a cell's outputs are fixed; i is their order
        <Output key={i} out={out} fileUrl={fileUrl} />
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 1600);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-1.5 rounded-lg bg-[var(--code-bg)] px-2 py-1 text-xs text-muted transition-colors hover:bg-default hover:text-foreground"
    >
      {state === 'copied' ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
      <span aria-live="polite">{state === 'copied' ? 'U kopjua' : state === 'failed' ? 'Gabim' : 'Kopjo'}</span>
    </button>
  );
}

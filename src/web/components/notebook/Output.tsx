import { BarChart3, Terminal } from 'lucide-react';
import type { OutputItem } from '../../../notebook/types';
import { sanitize } from '../../lib/sanitize';
import { PlotlyFigure } from './PlotlyFigure';

/** One saved output of a code cell, as the converter cleaned it (no errors, no desktop-window noise). */
export function Output({ out, fileUrl }: { out: OutputItem; fileUrl: (name: string) => string }) {
  switch (out.kind) {
    case 'stream':
      return (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-separator px-4 py-1.5 text-[0.7rem] font-semibold tracking-wider text-muted uppercase">
            <Terminal className="size-3.5" aria-hidden="true" /> Rezultati
          </div>
          <pre className="nb-stream overflow-x-auto px-4 py-3 font-mono text-[0.8rem] leading-relaxed text-foreground/90">
            {out.text}
          </pre>
        </div>
      );
    case 'image':
      return (
        <figure className="overflow-hidden rounded-2xl border border-border bg-white p-2 dark:bg-surface">
          <img
            src={fileUrl(out.file)}
            alt="Figura e prodhuar nga kodi i mësipërm"
            loading="lazy"
            decoding="async"
            className="mx-auto block h-auto max-w-full rounded-xl"
          />
        </figure>
      );
    case 'plotly':
      return (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-separator px-4 py-1.5 text-[0.7rem] font-semibold tracking-wider text-muted uppercase">
            <BarChart3 className="size-3.5" aria-hidden="true" /> Grafik interaktiv
          </div>
          <PlotlyFigure src={fileUrl(out.file)} />
        </div>
      );
    case 'html':
      return (
        <div
          className="nb-prose overflow-x-auto rounded-2xl border border-border bg-surface p-4"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized; the converter's HTML for a table or rich output
          dangerouslySetInnerHTML={{ __html: sanitize(out.html) }}
        />
      );
    default:
      return null;
  }
}

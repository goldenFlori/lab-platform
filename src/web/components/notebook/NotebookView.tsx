import 'katex/dist/katex.min.css';
import { BookOpen, FlaskConical, Gauge, Globe2, House, Lightbulb, type LucideIcon, Users } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import type { StoredNotebook } from '../../../notebook/stored';
import type { MarkdownCell, SectionKind } from '../../../notebook/types';
import type { Embed } from '../../../shared/notebooks';
import { isVisualizerId } from '../../../shared/visualizers';
import { type Messages, useT } from '../../i18n';
import { sanitize } from '../../lib/sanitize';
import { VizEmbed } from '../VizEmbed';
import { CodeCell } from './CodeCell';

// A notebook as the course site shows it: markdown as reading text and section cards, code shown
// tidily with long implementations folded, and an exercise that opens a desktop window replaced
// by its interactive version. Nothing here runs notebook code.

/** How each kind of section is marked: exercise, theory, classwork and so on. */
export const SECTION_KINDS: Partial<Record<SectionKind, { icon: LucideIcon; color: string }>> = {
  exercise: { icon: FlaskConical, color: 'var(--accent)' },
  theory: { icon: BookOpen, color: 'var(--brand-2)' },
  classwork: { icon: Users, color: 'var(--warning)' },
  homework: { icon: House, color: 'var(--danger)' },
  reflect: { icon: Lightbulb, color: 'var(--brand-3)' },
  scenario: { icon: Globe2, color: 'var(--success)' },
  complexity: { icon: Gauge, color: 'var(--brand-2)' },
};

/** The marked section kinds' names, in the interface language. */
export const sectionLabel = (t: Messages, kind: SectionKind) =>
  (t.notebook.kinds as Partial<Record<SectionKind, string>>)[kind] ?? '';

/** Where an embed for a cell is anchored, so a page can link to it. */
export const embedAnchor = (notebookId: string, cell: number) => `viz-${notebookId}-${cell}`;

export function NotebookView({
  id,
  notebook,
  embeds,
  fileUrl,
}: {
  id: string;
  notebook: StoredNotebook;
  embeds: Embed[];
  fileUrl: (name: string) => string;
}) {
  const t = useT();
  const embedAt = new Map(embeds.map((embed) => [embed.cell, embed]));
  const lastOfSource = new Map<number, number>();
  notebook.cells.forEach((cell, i) => {
    lastOfSource.set(cell.srcIndex, i);
  });

  const viz = (embed: Embed, label: string) =>
    isVisualizerId(embed.viz) ? (
      <div id={embedAnchor(id, embed.cell)} className="my-2 scroll-mt-24">
        <VizEmbed viz={embed.viz} props={embed.props} label={`${label} · ${embed.title ?? ''}`} />
      </div>
    ) : null;

  return (
    <div className="notebook flex flex-col gap-6">
      {notebook.cells.map((cell, i) => {
        const embed = embedAt.get(cell.srcIndex);
        // An exercise that opens a window: the interactive version comes first, the code folds below it.
        const before = embed && cell.type === 'code' && cell.interactive;
        // Otherwise the visualization follows the last cell made from that notebook cell.
        const after = embed && !before && lastOfSource.get(cell.srcIndex) === i;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: the cells of a stored notebook never change order
          <Fragment key={i}>
            {before && viz(embed, t.notebook.interactiveFirst)}
            {/* Its position, for following the host in a Live Lab (#66); no box of its own. */}
            <div data-at={i} className="contents">
              {cell.type === 'markdown' ? <Markdown cell={cell} /> : <CodeCell cell={cell} fileUrl={fileUrl} />}
            </div>
            {after && viz(embed, t.notebook.tryInBrowser)}
          </Fragment>
        );
      })}
    </div>
  );
}

/** One markdown cell: reading text, or a section card when it starts an exercise, theory and so on. */
export function Markdown({ cell }: { cell: MarkdownCell }) {
  const t = useT();
  const body = cell.html.trim() ? (
    <div
      className="nb-prose"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized; the converter's markdown
      dangerouslySetInnerHTML={{ __html: sanitize(cell.html) }}
    />
  ) : null;
  const meta = SECTION_KINDS[cell.kind];
  const level = cell.level ?? 2;

  if (meta && cell.heading) {
    const Icon = meta.icon;
    const badge = (
      <div className="flex items-start gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-2xl"
          style={{ background: 'color-mix(in oklab, var(--kind) 14%, transparent)', color: 'var(--kind)' }}
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[0.7rem] font-semibold tracking-wider uppercase" style={{ color: 'var(--kind)' }}>
            {sectionLabel(t, cell.kind)}
          </p>
          <HeadingLink id={cell.id}>
            {!body || level <= 2 ? (
              <h2
                className={`leading-snug font-bold tracking-tight text-balance ${body ? 'text-xl sm:text-2xl' : 'text-2xl'}`}
              >
                {cell.heading}
              </h2>
            ) : (
              <h3 className="text-lg leading-snug font-bold tracking-tight text-balance">{cell.heading}</h3>
            )}
          </HeadingLink>
        </div>
      </div>
    );
    const kind = { '--kind': meta.color } as React.CSSProperties;
    return body ? (
      <section
        id={cell.id}
        className="scroll-mt-24 rounded-3xl border border-border bg-surface p-5 shadow-surface sm:p-7"
        style={kind}
      >
        <div className="mb-4">{badge}</div>
        {body}
      </section>
    ) : (
      <section id={cell.id} className="mt-6 scroll-mt-24 border-t border-separator pt-8" style={kind}>
        {badge}
      </section>
    );
  }

  if (cell.heading) {
    return (
      <section id={cell.id} className="scroll-mt-24">
        <HeadingLink id={cell.id}>
          {level <= 2 ? (
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-balance">{cell.heading}</h2>
          ) : (
            <h3 className="mt-2 text-xl font-bold tracking-tight text-balance">{cell.heading}</h3>
          )}
        </HeadingLink>
        {body && <div className="mt-3">{body}</div>}
      </section>
    );
  }

  if (cell.id) return <span id={cell.id} className="block scroll-mt-24" />;
  return body;
}

function HeadingLink({ id, children }: { id?: string; children: ReactNode }) {
  return id ? (
    <a href={`#${id}`} className="block">
      {children}
    </a>
  ) : (
    children
  );
}

import { Maximize2, Minimize2 } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { IconButton } from './controls';
import { RichText } from './RichText';
import { KIT, useText } from './text';

/* ------------------------------------------------------------------ */
/* Frame shared by every visualizer                                    */
/* ------------------------------------------------------------------ */

export function VizShell({
  title,
  subtitle,
  icon,
  badges,
  toolbar,
  children,
  footer,
  onKeyDown,
  className = '',
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  badges?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  const [full, setFull] = useState(false);
  const [canFull, setCanFull] = useState(false);
  const k = useText(KIT);

  useEffect(() => {
    setCanFull(typeof document !== 'undefined' && !!document.fullscreenEnabled);
    const onChange = () => setFull(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFull = () => {
    if (!ref.current) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current.requestFullscreen();
  };

  // A named region, so screen reader users can jump between the visualizations on a page. The keys of
  // its controls bubble up here, which is where the step shortcuts listen.
  return (
    <section
      ref={ref}
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-viz=""
      className={`viz-shell not-prose relative flex flex-col overflow-hidden rounded-3xl border border-border bg-surface text-foreground shadow-surface outline-none ${
        full ? 'h-full overflow-y-auto rounded-none bg-background' : ''
      } ${className}`}
    >
      <header className="flex items-start gap-3 border-b border-separator px-4 py-3.5 sm:px-5">
        {icon && (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-white shadow-sm [&_svg]:size-[18px]">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-[1.02rem] leading-tight font-semibold tracking-tight">
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {badges}
          {canFull && (
            <IconButton label={full ? k.exitFullscreen : k.fullscreen} onPress={toggleFull} variant="ghost">
              {full ? <Minimize2 /> : <Maximize2 />}
            </IconButton>
          )}
        </div>
      </header>

      {toolbar && (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-separator bg-surface-secondary/60 px-4 py-3 sm:px-5">
          {toolbar}
        </div>
      )}

      <div className="min-w-0 flex-1">{children}</div>

      {footer && <div className="flex flex-col gap-3 border-t border-separator px-4 py-3.5 sm:px-5">{footer}</div>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger';

const toneBar: Record<Tone, string> = {
  default: 'before:bg-border',
  accent: 'before:bg-accent',
  success: 'before:bg-success',
  warning: 'before:bg-warning',
  danger: 'before:bg-danger',
};

/** The explanation of the current step. Announced to screen readers. */
export function StepNote({ text, tone = 'accent' }: { text: string; tone?: Tone }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={`relative min-h-[3.1rem] rounded-2xl bg-surface-secondary py-2.5 pr-4 pl-5 text-[0.94rem] leading-relaxed text-foreground/90 before:absolute before:top-2.5 before:bottom-2.5 before:left-2 before:w-1 before:rounded-full ${toneBar[tone]}`}
    >
      <RichText text={text} />
    </p>
  );
}

export function Panel({
  title,
  children,
  className = '',
  aside,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
}) {
  return (
    <section className={`min-w-0 rounded-2xl border border-border bg-surface p-3.5 ${className}`}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h4 className="text-[0.7rem] font-semibold tracking-wider text-muted uppercase">{title}</h4>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  hint?: string;
}) {
  const color =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'success'
        ? 'text-success'
        : tone === 'warning'
          ? 'text-warning'
          : tone === 'danger'
            ? 'text-danger'
            : 'text-foreground';
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-surface px-3.5 py-2.5" title={hint}>
      <div className="truncate text-[0.7rem] font-semibold tracking-wider text-muted uppercase">{label}</div>
      <div className={`mt-0.5 truncate font-mono text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

export function Legend({
  items,
}: {
  items: { color: string; label: string; shape?: 'dot' | 'line' | 'ring' | 'dash' }[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          {it.shape === 'line' || it.shape === 'dash' ? (
            <svg width="18" height="6" aria-hidden="true">
              <line
                x1="1"
                y1="3"
                x2="17"
                y2="3"
                stroke={it.color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={it.shape === 'dash' ? '3 3' : undefined}
              />
            </svg>
          ) : (
            <span
              className="inline-block size-3 rounded-full"
              style={it.shape === 'ring' ? { border: `2.5px solid ${it.color}` } : { background: it.color }}
              aria-hidden="true"
            />
          )}
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export function Pseudocode({ lines, active }: { lines: string[]; active?: number | null }) {
  return (
    <ol className="-mx-1 space-y-0.5 overflow-x-auto px-1 font-mono text-[0.76rem] leading-relaxed">
      {lines.map((l, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: the pseudocode is fixed; i is the line number
          key={i}
          className={`w-max min-w-full rounded-lg px-2 py-0.5 whitespace-pre transition-colors ${
            active === i ? 'bg-accent-soft font-semibold text-accent' : 'text-muted'
          }`}
        >
          {l}
        </li>
      ))}
    </ol>
  );
}

/** A horizontal list of tokens: a queue, a stack, an order. */
export function TokenRow({
  items,
  empty = '∅',
  tone = 'default',
  label,
}: {
  items: (string | number)[];
  empty?: string;
  tone?: Tone;
  label?: string;
}) {
  const cls =
    tone === 'accent'
      ? 'bg-accent-soft text-accent border-accent/30'
      : tone === 'success'
        ? 'bg-success-soft text-success border-success/30'
        : tone === 'warning'
          ? 'bg-warning-soft text-warning border-warning/30'
          : 'bg-surface-secondary text-foreground border-border';
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label={label}>
      {items.length === 0 ? (
        <li className="font-mono text-sm text-muted">{empty}</li>
      ) : (
        items.map((x, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: a queue can hold the same value twice; the position tells them apart
            key={`${x}-${i}`}
            className={`rounded-lg border px-2 py-0.5 font-mono text-sm font-medium ${cls}`}
          >
            {x}
          </li>
        ))
      )}
    </ul>
  );
}

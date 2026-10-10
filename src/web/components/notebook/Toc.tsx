import { useEffect, useMemo, useState } from 'react';
import type { SectionKind, TocEntry } from '../../../notebook/types';

const DOT: Partial<Record<SectionKind, string>> = {
  exercise: 'var(--accent)',
  classwork: 'var(--warning)',
  homework: 'var(--danger)',
  reflect: 'var(--brand-3)',
  theory: 'var(--brand-2)',
  scenario: 'var(--success)',
};

/** The notebook's sections, following the reader's position. */
export function Toc({ entries }: { entries: TocEntry[] }) {
  const items = useMemo(() => entries.filter((entry) => entry.level <= 3), [entries]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const targets = items.map((item) => document.getElementById(item.id)).filter((el) => el !== null);
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (observed) => {
        const visible = observed
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -65% 0px' },
    );
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;
  return (
    <nav className="sticky top-24 max-h-[calc(100dvh-8rem)] overflow-y-auto pr-1" aria-label="Përmbajtja">
      <p className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">Përmbajtja</p>
      <ul className="space-y-0.5 border-l border-separator">
        {items.map((item) => {
          const on = item.id === active;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={on ? 'location' : undefined}
                className={`-ml-px flex items-start gap-2 border-l-2 py-1 text-[0.8rem] leading-snug transition-colors hover:text-foreground ${
                  item.level >= 3 ? 'pl-6' : 'pl-3'
                } ${on ? 'border-accent font-medium text-foreground' : 'border-transparent text-muted'}`}
              >
                {DOT[item.kind] && (
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full"
                    style={{ background: DOT[item.kind] }}
                    aria-hidden="true"
                  />
                )}
                <span className="line-clamp-2">{item.title}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

import type { ReactNode } from 'react';

/**
 * A wide table that scrolls sideways on a phone (#192): a named region the keyboard can reach and
 * scroll with the arrow keys (WCAG 2.1.1), with the focus ring showing where it is.
 */
export function ScrollRegion({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a region that scrolls must be reachable by keyboard (WCAG 2.1.1)
      tabIndex={0}
      className={`overflow-x-auto rounded-lg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus ${className}`}
    >
      {children}
    </section>
  );
}

import { Fragment } from 'react';

/**
 * Renders the tiny markup used in step explanations:
 *   **bold**   `code`
 * Notes are authored in this repository, never taken from user input.
 */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return (
            <strong
              // biome-ignore lint/suspicious/noArrayIndexKey: the segments of a fixed note, in order
              key={i}
              className="font-semibold text-foreground"
            >
              {p.slice(2, -2)}
            </strong>
          );
        }
        if (p.startsWith('`') && p.endsWith('`')) {
          return (
            <code
              // biome-ignore lint/suspicious/noArrayIndexKey: the segments of a fixed note, in order
              key={i}
              className="rounded-md border border-border bg-surface-tertiary px-1.5 py-0.5 font-mono text-[0.86em] text-foreground"
            >
              {p.slice(1, -1)}
            </code>
          );
        }
        return (
          <Fragment
            // biome-ignore lint/suspicious/noArrayIndexKey: the segments of a fixed note, in order
            key={i}
          >
            {p}
          </Fragment>
        );
      })}
    </>
  );
}

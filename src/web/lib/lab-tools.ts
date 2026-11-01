import { useEffect, useRef } from 'react';

// The lab header's menus open tools that live elsewhere on the page: the "AI" menu (#98) the
// copilot's variants, the translation panel and the Live Lab's quick question; the "More" menu
// (#130) the upload, a new version (#208), translation and deletion of notebooks. Each tool listens for its name, so
// the menus need no wiring through the page.

export type LabTool = 'variant' | 'translate' | 'quiz' | 'upload' | 'version' | 'delete';

const EVENT = 'lab-tool';

export function openLabTool(tool: LabTool) {
  window.dispatchEvent(new CustomEvent<LabTool>(EVENT, { detail: tool }));
}

/** Runs `open` when the menu asks for `tool`. */
export function useLabTool(tool: LabTool, open: () => void) {
  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    const listener = (event: Event) => {
      if ((event as CustomEvent<LabTool>).detail === tool) latest.current();
    };
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, [tool]);
}

/** Scrolls to what `selector` marks once it has rendered. */
export function revealSoon(selector: string) {
  setTimeout(() => document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
}

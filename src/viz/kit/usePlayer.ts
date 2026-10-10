import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Step player shared by every visualizer.
 *
 * Steps are pre-computed by a pure algorithm function, so stepping backwards
 * is free and the explanation for every step is known in advance.
 */
export interface Player<S> {
  index: number;
  step: S;
  total: number;
  playing: boolean;
  speed: number;
  atStart: boolean;
  atEnd: boolean;
  go: (i: number) => void;
  next: () => void;
  prev: () => void;
  reset: () => void;
  end: () => void;
  toggle: () => void;
  pause: () => void;
  setSpeed: (s: number) => void;
}

export function usePlayer<S>(steps: S[], baseDelay = 900): Player<S> {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const total = steps.length;

  // A new run (new input, new algorithm) always starts from the first step: adjusted while
  // rendering, as React recommends for state that follows a prop, so no stale frame is drawn.
  const [run, setRun] = useState(steps);
  if (run !== steps) {
    setRun(steps);
    setIndex(0);
    setPlaying(false);
  }

  useEffect(() => {
    if (!playing) return;
    if (index >= total - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setIndex((i) => Math.min(i + 1, total - 1)), baseDelay / speed);
    return () => window.clearTimeout(t);
  }, [playing, index, speed, total, baseDelay]);

  const clampIndex = useCallback((i: number) => Math.max(0, Math.min(total - 1, i)), [total]);
  const go = useCallback((i: number) => setIndex(clampIndex(i)), [clampIndex]);
  const pause = useCallback(() => setPlaying(false), []);
  const next = useCallback(() => {
    setPlaying(false);
    setIndex((i) => clampIndex(i + 1));
  }, [clampIndex]);
  const prev = useCallback(() => {
    setPlaying(false);
    setIndex((i) => clampIndex(i - 1));
  }, [clampIndex]);
  const reset = useCallback(() => {
    setPlaying(false);
    setIndex(0);
  }, []);
  const end = useCallback(() => {
    setPlaying(false);
    setIndex(Math.max(0, total - 1));
  }, [total]);
  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p && index >= total - 1) {
        setIndex(0);
        return true;
      }
      return !p;
    });
  }, [index, total]);

  const safeIndex = Math.min(index, Math.max(0, total - 1));

  return useMemo(
    () => ({
      index: safeIndex,
      step: steps[safeIndex],
      total,
      playing,
      speed,
      atStart: safeIndex === 0,
      atEnd: safeIndex >= total - 1,
      go,
      next,
      prev,
      reset,
      end,
      toggle,
      pause,
      setSpeed,
    }),
    [safeIndex, steps, total, playing, speed, go, next, prev, reset, end, toggle, pause],
  );
}

/** Keyboard shortcuts for a player, scoped to the visualizer that owns it. */
export function playerKeys(p: Pick<Player<unknown>, 'next' | 'prev' | 'toggle' | 'reset' | 'end'>) {
  return (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable="true"], [role="slider"]')) return;
    switch (e.key) {
      case 'ArrowRight':
        p.next();
        e.preventDefault();
        break;
      case 'ArrowLeft':
        p.prev();
        e.preventDefault();
        break;
      case ' ':
        if (t.closest('button, a, [role="button"]')) return;
        p.toggle();
        e.preventDefault();
        break;
      case 'Home':
        p.reset();
        e.preventDefault();
        break;
      case 'End':
        p.end();
        e.preventDefault();
        break;
    }
  };
}

import { type Locale, useLocale } from '../../web/i18n';

// The visualizations' text in Albanian and English (#19). Each visualization keeps its own,
// beside it, so it loads with the visualization's chunk rather than with every page. Albanian is
// the source; `bilingual` makes TypeScript require every message in English too.

export type Bilingual<T> = Record<Locale, T>;

export const bilingual = <T>(sq: T, en: NoInfer<T>): Bilingual<T> => ({ sq, en });

/** The text in the interface language; the component re-renders when it changes. */
export function useText<T>(text: Bilingual<T>): T {
  return text[useLocale()];
}

/** The kit's own controls. */
export const KIT = bilingual(
  {
    restart: 'Rifillo (Home)',
    previous: 'Hapi i mëparshëm (←)',
    pause: 'Pauzë',
    play: 'Luaj',
    replay: 'Rishiko',
    next: 'Hapi tjetër (→)',
    end: 'Shko te fundi (End)',
    step: 'Hapi i algoritmit',
    speed: 'Shpejtësia',
    exitFullscreen: 'Dil nga ekrani i plotë',
    fullscreen: 'Ekran i plotë',
    edge: (u: string, v: string) => `Brinja ${u}–${v}`,
    vertex: (label: string) => `Kulmi ${label}`,
  },
  {
    restart: 'Restart (Home)',
    previous: 'Previous step (←)',
    pause: 'Pause',
    play: 'Play',
    replay: 'Replay',
    next: 'Next step (→)',
    end: 'Go to the end (End)',
    step: 'Algorithm step',
    speed: 'Speed',
    exitFullscreen: 'Exit full screen',
    fullscreen: 'Full screen',
    edge: (u: string, v: string) => `Edge ${u}–${v}`,
    vertex: (label: string) => `Vertex ${label}`,
  },
);

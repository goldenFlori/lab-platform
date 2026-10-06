import { useCallback, useSyncExternalStore } from 'react';

// Light or dark. The default follows the system; an explicit choice is remembered.
// The inline script in index.html applies the same rules before the first paint, so keep them in sync.

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null; // Storage can be blocked; fall back to the system theme.
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.dataset.theme = theme;
}

function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  const media = matchMedia(DARK_QUERY);
  const followSystem = () => {
    if (!storedTheme()) applyTheme(media.matches ? 'dark' : 'light');
  };
  media.addEventListener('change', followSystem);

  return () => {
    observer.disconnect();
    media.removeEventListener('change', followSystem);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, currentTheme);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not remembered, but still applied.
    }
    applyTheme(next);
  }, []);

  return { theme, setTheme };
}

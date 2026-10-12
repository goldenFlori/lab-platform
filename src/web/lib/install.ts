import { useSyncExternalStore } from 'react';

// Installing the app (#89). Chrome, Edge and Android offer it with an event the page keeps until
// the user asks; Safari on iPhone and iPad has no such event, so they get the steps instead.

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let offered: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const changed = () => {
  for (const listener of listeners) listener();
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    offered = event as InstallPrompt;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    offered = null;
    changed();
  });
}

const installed = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** An iPhone or iPad, including iPads that say they are a Mac. */
const apple = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** How this browser installs the app: its own prompt, Apple's steps, or not at all (or already). */
export function useInstall(): 'prompt' | 'apple' | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (installed() ? null : offered ? 'prompt' : apple() ? 'apple' : null),
    () => null,
  );
}

/** Shows the browser's install prompt; it can be shown only once. */
export async function install() {
  const prompt = offered;
  if (!prompt) return;
  offered = null;
  changed();
  await prompt.prompt();
}

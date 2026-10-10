import { useSyncExternalStore } from 'react';
import { DEFAULT_LOCALE, isLocale, type Locale } from '../../shared/locale';
import { en } from './en';
import { type Messages, sq } from './sq';

// The interface in Albanian and English (#19). Albanian (sq.ts) is the source; English must have
// every message, or the build fails. Components read messages with useT(); code outside React
// (page titles, error texts) with t(). Course content, such as notebooks, is not translated.

export type { Locale, Messages };

const DICTIONARIES: Record<Locale, Messages> = { sq, en };
const STORAGE_KEY = 'locale';

/** The language chosen on this device, for when nobody is signed in. */
export function storedLocale(): Locale | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Not remembered on this device, but still applied.
  }
}

let current: Locale = typeof localStorage === 'undefined' ? DEFAULT_LOCALE : (storedLocale() ?? DEFAULT_LOCALE);
// index.html says Albanian; correct it at once when this device chose otherwise.
if (typeof document !== 'undefined') document.documentElement.lang = current;
const listeners = new Set<() => void>();

export const getLocale = () => current;

/** Switches the interface language; returns whether it changed. */
export function setLocale(locale: Locale) {
  if (locale === current) return false;
  current = locale;
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  for (const listener of listeners) listener();
  return true;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The messages in the current language, outside React. */
export const t = (): Messages => DICTIONARIES[current];

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/** The messages in the current language; the component re-renders when it changes. */
export function useT(): Messages {
  return DICTIONARIES[useLocale()];
}

export const LANGUAGE_NAMES: Record<Locale, string> = { sq: 'Shqip', en: 'English' };

// The interface languages (#19). Albanian is the default. No imports: both the API and the app
// use this.

export const LOCALES = ['sq', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'sq';

export function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly unknown[]).includes(value);
}

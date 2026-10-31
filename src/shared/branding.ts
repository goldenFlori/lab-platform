// An institution's branding (#201): its name, an accent colour and a logo. No Zod and no imports: the
// app checks a colour as it is chosen with the same rule the API enforces.

/** What members see, and the sign-in page reached from a join code. `logo` is a URL, or null. */
export type Branding = { name: string; accent: string | null; logo: string | null };

/** A logo's largest size, and the image types it may be. */
export const LOGO_BYTES = 100_000;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
export type LogoType = (typeof LOGO_TYPES)[number];
export const isLogoType = (type: string): type is LogoType => (LOGO_TYPES as readonly string[]).includes(type);

export const ACCENT_PATTERN = /^#[0-9a-f]{6}$/i;

const channel = (hex: string, i: number) => {
  const c = Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);

/** WCAG's contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `colour` laid over white at `share` (the soft tint behind accent text). */
function tint(colour: string, share: number) {
  const mix = [0, 1, 2].map((i) =>
    Math.round(share * Number.parseInt(colour.slice(1 + 2 * i, 3 + 2 * i), 16) + (1 - share) * 255),
  );
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Why an accent cannot be used, or null. It carries white text on buttons, is text on white, and is
 * text on its own soft tint: each needs WCAG AA's 4.5:1 (#192).
 */
export function accentIssue(accent: string): 'format' | 'contrast' | null {
  if (!ACCENT_PATTERN.test(accent)) return 'format';
  const lowest = Math.min(contrast(accent, '#ffffff'), contrast(accent, tint(accent, 0.1)));
  return lowest >= 4.5 ? null : 'contrast';
}

/** The lowest of an accent's three contrasts, to show while choosing. */
export const accentContrast = (accent: string) =>
  ACCENT_PATTERN.test(accent) ? Math.min(contrast(accent, '#ffffff'), contrast(accent, tint(accent, 0.1))) : 0;

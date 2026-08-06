/**
 * Locales the catalog is translated into (KAN-8).
 *
 * ── Why English is more than "the first locale" ───────────────────────────
 *
 * `en` is the fallback for every other locale and the anchor the matcher
 * compares against, so it is required on every catalog document while the
 * others are optional. A Spanish-only variable would be invisible to an
 * English reader *and* unmatchable, which is worse than an untranslated one.
 *
 * The fallback is deliberately never blank. Showing an English name to a
 * Spanish reader is a visible gap they can report; showing an empty card is a
 * bug that looks like missing data.
 */

export const LOCALES = ['en', 'es'] as const;

export type Locale = (typeof LOCALES)[number];

/** Fallback for every locale, and the language the catalog is keyed in. */
export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Best supported locale for a BCP-47 tag.
 *
 * Matches on the primary subtag only: `es-MX`, `es-419` and `es` all resolve
 * to `es`. Regional variants of laboratory vocabulary exist, but one Spanish
 * translation that everyone can read beats a regional one that only some can.
 */
export function resolveLocale(tag: string | null | undefined): Locale {
  if (!tag) return DEFAULT_LOCALE;
  const primary = tag.toLowerCase().split(/[-_]/)[0];
  return isLocale(primary) ? primary : DEFAULT_LOCALE;
}

/** The browser's preference, in order, or the default when none is supported. */
export function detectLocale(
  preferred: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [],
): Locale {
  for (const tag of preferred) {
    const primary = tag.toLowerCase().split(/[-_]/)[0];
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}

/**
 * A string translated into the locales we have it in.
 *
 * `en` is required; everything else is optional and falls back. Modelled as a
 * map rather than parallel `nameEn`/`nameEs` fields so that adding a locale is
 * a data change rather than a schema migration on every document.
 */
export type Translated<T = string> = { en: T } & Partial<Record<Locale, T>>;

/** The requested locale's text, or English. Never empty when `en` is set. */
export function translate<T>(field: Translated<T>, locale: Locale): T {
  return field[locale] ?? field.en;
}

/**
 * Reads a possibly-malformed translation map off a Firestore document.
 *
 * Documents written before a locale existed, or imported from a sheet with a
 * blank column, will be missing entries. Anything that is not a non-empty
 * string is dropped rather than surfaced as an empty label.
 */
export function readTranslated(value: unknown, fallback: string): Translated {
  const source = (value ?? {}) as Record<string, unknown>;
  const result: Translated = { en: fallback };

  for (const locale of LOCALES) {
    const text = source[locale];
    if (typeof text === 'string' && text.trim()) result[locale] = text.trim();
  }

  return result;
}

/** Same, for text that is legitimately absent — a description nobody wrote. */
export function readTranslatedOptional(value: unknown): Partial<Record<Locale, string>> {
  const source = (value ?? {}) as Record<string, unknown>;
  const result: Partial<Record<Locale, string>> = {};

  for (const locale of LOCALES) {
    const text = source[locale];
    if (typeof text === 'string' && text.trim()) result[locale] = text.trim();
  }

  return result;
}

/** The requested locale's text, English, or null when nobody wrote it. */
export function translateOptional(
  field: Partial<Record<Locale, string>> | null | undefined,
  locale: Locale,
): string | null {
  if (!field) return null;
  return field[locale] ?? field[DEFAULT_LOCALE] ?? null;
}

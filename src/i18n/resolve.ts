/**
 * Locale resolution outside of React.
 *
 * Most of the app reads the language from context, but three callers cannot:
 * the error boundary (it renders when the tree below it has failed, which may
 * include the provider), `AuthProvider` (it creates the profile document, and
 * sits above the provider by necessity — the provider needs to know who is
 * signed in), and the initial state of the provider itself.
 *
 * They all want the same answer, so it is computed in one place.
 */

import { detectLocale, type Locale } from '@/domain/locales';

import { CATALOGS } from './catalogs';
import { format, type TextValues } from './format';
import type { MessageKey } from './messages';
import { readStoredLocale } from './storage';

/**
 * The language to start in: what the reader last chose on this device, else
 * what their browser asks for.
 *
 * A signed-in account's stored preference is applied on top of this by
 * `I18nProvider` once the profile arrives. It is not consulted here because
 * this has to answer synchronously, before first paint.
 */
export function resolveInitialLocale(): Locale {
  return readStoredLocale() ?? detectLocale();
}

/** Translate without a React context. Same catalog, same keys. */
export function translateStatic(key: MessageKey, values?: TextValues): string {
  return format(CATALOGS[resolveInitialLocale()][key], values);
}

/** Applied to `<html lang>` so screen readers pick the right pronunciation. */
export function applyDocumentLocale(locale: Locale): void {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

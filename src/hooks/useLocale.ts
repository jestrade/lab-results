/**
 * The language to show catalog content in.
 *
 * ── Scope: the data, not the chrome ──────────────────────────────────────
 *
 * This resolves which translation of a *variable* — its name, its category
 * heading, its explanation — the reader gets. The interface's own copy is
 * translated separately, through `@/i18n`, because the two have genuinely
 * different failure modes: a missing interface string is a bug the compiler
 * can catch, while a missing variable translation is ordinary missing content
 * that has to fall back to English at runtime.
 *
 * They resolve to the same locale, though, and always have to. Reading a
 * Spanish interface listing English variable names would be worse than either
 * one alone, so this reads the same value the interface does rather than
 * re-deriving it from the browser.
 */

import { useI18n } from '@/i18n/useI18n';
import type { Locale } from '@/domain/locales';

export function useLocale(): Locale {
  return useI18n().locale;
}
